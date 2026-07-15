import assert from "node:assert/strict";
import pg from "pg";
import { TestWorkflowRunnerService } from "../../apps/backend/src/test-workflows/runner/test-workflow-runner.service.ts";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = `${process.pid}_${Date.now()}`;
const workflowId = `twf_runner_${suffix}`;
const environmentId = `tenv_runner_${suffix}`;
const createdRunIds = [];
const calls = [];
let activeRunId = "";
let cancelOnPath = null;

const tryItOut = {
  async execute(input) {
    const body = input.body;
    calls.push({
      runId: activeRunId,
      path: body.path,
      query: body.query ?? {},
      headers: body.headers ?? {},
      body: body.body,
    });
    if (body.path === cancelOnPath) {
      await pool.query(
        'UPDATE "TestWorkflowRun" SET "cancelRequestedAt" = NOW() WHERE id = $1',
        [activeRunId],
      );
    }
    if (body.path.includes("request-error")) {
      throw new Error(`request rejected with ${body.headers.Authorization}`);
    }
    if (body.path.includes("setup")) {
      return {
        status: body.path.includes("setup-fail") ? 500 : 200,
        headers: { "x-runner": "setup" },
        body: JSON.stringify({ resourceId: "resource-123", reflected: body.headers.Authorization }),
      };
    }
    if (body.path.includes("test-fail")) {
      return { status: 500, headers: {}, body: "{}" };
    }
    if (body.path.includes("teardown-fail")) {
      return { status: 500, headers: {}, body: "{}" };
    }
    return { status: 200, headers: {}, body: JSON.stringify({ ok: true }) };
  },
};

const environmentService = {
  async loadRunEnvironmentContext(input) {
    if (input.environmentSnapshotJson === null) {
      return { values: { TOKEN: "legacy_live_value" }, secretKeys: new Set(["TOKEN"]) };
    }
    const token = input.environmentSnapshotJson.token;
    assert.equal(typeof token, "string");
    return { values: { TOKEN: token }, secretKeys: new Set(["TOKEN"]) };
  },
};

const runner = new TestWorkflowRunnerService({}, tryItOut, environmentService);

function node(id, phase, path, options = {}) {
  return {
    id,
    type: "endpoint",
    operationId: id,
    method: "POST",
    path,
    label: id,
    phase,
    position: { x: 0, y: 0 },
    requestTemplate: options.requestTemplate ?? {
      serverUrl: "https://api.example.test",
      headers: { Authorization: "Bearer {{env.TOKEN}}" },
    },
    exports: options.exports ?? [],
    assertions: options.assertions ?? [{ id: `${id}-status`, type: "status", operator: "equals", expected: 200 }],
  };
}

async function runScenario(name, definition, options = {}) {
  const runId = `twr_${name}_${suffix}`;
  createdRunIds.push(runId);
  activeRunId = runId;
  cancelOnPath = options.cancelOnPath ?? null;
  const environmentSnapshot = options.legacy === true ? null : { token: "snapshot_token_not_secret" };
  await pool.query(
    `INSERT INTO "TestWorkflowRun"
      (id, "workflowId", "organizationId", "docId", "branchId", "versionId", "environmentId",
       status, "definitionSnapshotJson", "metadataSnapshotJson", "environmentSnapshotJson",
       "cancelRequestedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, 'org_acme', 'doc_payments', 'br_payments_main', 'ver_payments_1', $3,
       'queued', $4, '{"tags":[],"priority":"medium","type":"integration"}', $5,
       $6, NOW(), NOW())`,
    [
      runId,
      workflowId,
      environmentId,
      JSON.stringify(definition),
      environmentSnapshot === null ? null : JSON.stringify(environmentSnapshot),
      options.cancelBefore === true ? new Date() : null,
    ],
  );
  for (const step of definition.nodes) {
    await pool.query(
      `INSERT INTO "TestWorkflowStepRun"
        (id, "runId", "nodeId", "operationId", phase, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'queued', NOW(), NOW())`,
      [`tws_${name}_${step.id}_${suffix}`, runId, step.id, step.operationId, step.phase],
    );
  }
  await runner.process({
    runId,
    orgSlug: "acme",
    docSlug: "payments",
    branchSlug: "main",
  });
  const runResult = await pool.query(
    'SELECT status, "errorCode", "durationMs" FROM "TestWorkflowRun" WHERE id = $1',
    [runId],
  );
  const stepResult = await pool.query(
    `SELECT "nodeId", phase, status, "requestJson", "responseJson", "inputsJson", "exportsJson", "errorCode", "errorMessage"
     FROM "TestWorkflowStepRun" WHERE "runId" = $1 ORDER BY "startedAt" ASC NULLS LAST, "createdAt" ASC`,
    [runId],
  );
  const scenarioCalls = calls.filter((call) => call.runId === runId).map((call) => ({
    path: call.path, query: Object.fromEntries(Object.entries(call.query).map(([key, value]) => [key, String(value).replaceAll("snapshot_token_not_secret", "[REDACTED]")])),
    consumedSecretVar: call.query.secretEcho === "Bearer snapshot_token_not_secret",
    usedSnapshot: call.headers.Authorization === "Bearer snapshot_token_not_secret",
    usedLegacy: call.headers.Authorization === "Bearer legacy_live_value",
  }));
  return { runId, run: runResult.rows[0], steps: stepResult.rows, calls: scenarioCalls };
}

try {
  await pool.query(
    `INSERT INTO "TestWorkflow"
      (id, "organizationId", "docId", "branchId", name, slug, "definitionJson", revision,
       "createdByUserId", tags, priority, type, "createdAt", "updatedAt")
     VALUES ($1, 'org_acme', 'doc_payments', 'br_payments_main', $2, $3, '{"schemaVersion":2,"context":{"testData":{}},"nodes":[],"edges":[]}', 1,
       'usr_b7cc4c3a-6395-427c-a2e6-794b5debfea2', '{}', 'medium', 'integration', NOW(), NOW())`,
    [workflowId, `Runner ${suffix}`, `runner-${suffix}`],
  );
  await pool.query(
    `INSERT INTO "TestEnvironment"
      (id, "organizationId", "docId", "branchId", name, "isDefault", "createdAt", "updatedAt")
     VALUES ($1, 'org_acme', 'doc_payments', 'br_payments_main', 'Runner environment', false, NOW(), NOW())`,
    [environmentId],
  );

  const happy = await runScenario("happy", {
    schemaVersion: 2,
    context: { testData: { expected: "saved-data" } },
    nodes: [
      node("cleanup", "teardown", "/cleanup/{resourceId}", {
        requestTemplate: {
          serverUrl: "https://api.example.test",
          headers: { Authorization: "Bearer {{env.TOKEN}}" },
          pathParams: { resourceId: "{{vars.resourceId}}" },
        },
      }),
      node("request", "test", "/request/{resourceId}", {
        requestTemplate: {
          serverUrl: "https://api.example.test",
          headers: { Authorization: "Bearer {{env.TOKEN}}" },
          pathParams: { resourceId: "{{vars.resourceId}}" },
          query: { expected: "{{data.expected}}", secretEcho: "{{vars.reflectedSecret}}" },
        },
      }),
      node("setup", "setup", "/setup", {
        exports: [{ name: "resourceId", source: "body", path: "$.resourceId" }, { name: "reflectedSecret", source: "body", path: "$.reflected" }],
      }),
    ],
    edges: [
      { id: "setup-request", source: "setup", target: "request" },
      { id: "request-cleanup", source: "request", target: "cleanup" },
    ],
  });
  const happyCallCount = happy.calls.length;
  activeRunId = happy.runId;
  await runner.process({ runId: happy.runId, orgSlug: "acme", docSlug: "payments", branchSlug: "main" });
  happy.terminalReplaySkipped = calls.filter((call) => call.runId === happy.runId).length === happyCallCount;

  const setupFailure = await runScenario("setup_failure", {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [
      node("test-independent", "test", "/independent"),
      node("cleanup-fail", "teardown", "/teardown-fail"),
      node("cleanup", "teardown", "/cleanup"),
      node("setup-fail", "setup", "/setup-fail", {
        assertions: [{ id: "setup-status", type: "status", operator: "equals", expected: 200 }],
      }),
    ],
    edges: [],
  });

  const testFailure = await runScenario("test_failure", {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [
      node("child", "test", "/child"),
      node("cleanup", "teardown", "/cleanup"),
      node("independent", "test", "/independent"),
      node("test-fail", "test", "/test-fail"),
    ],
    edges: [{ id: "fail-child", source: "test-fail", target: "child" }],
  });

  const teardownFailure = await runScenario("teardown_failure", {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [
      node("teardown-fail", "teardown", "/teardown-fail", {
        requestTemplate: { serverUrl: "https://api.example.test", body: "{{vars.missing}}" },
      }),
      node("teardown-ok", "teardown", "/teardown-ok"),
      node("test-ok", "test", "/test-ok"),
    ],
    edges: [],
  });

  const canceled = await runScenario("canceled", {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [
      node("setup", "setup", "/setup"),
      node("test", "test", "/test"),
      node("cleanup", "teardown", "/teardown-fail"),
    ],
    edges: [],
  }, { cancelOnPath: "/setup" });

  const teardownCanceled = await runScenario("teardown_canceled", {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [node("test", "test", "/test"), node("teardown-cancel", "teardown", "/teardown-cancel"), node("teardown-after", "teardown", "/teardown-after")],
    edges: [],
  }, { cancelOnPath: "/teardown-cancel" });

  const legacy = await runScenario("legacy", {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [node("legacy-test", "test", "/legacy")],
    edges: [],
  }, { legacy: true });

  const secretFailure = await runScenario("secret_failure", {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [node("request-error", "test", "/request-error")],
    edges: [],
  });

  const payload = { happy, setupFailure, testFailure, teardownFailure, canceled, teardownCanceled, legacy, secretFailure };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
} finally {
  await runner.onModuleDestroy();
  await pool.query('DELETE FROM "TestWorkflowRun" WHERE id = ANY($1)', [createdRunIds]);
  await pool.query('DELETE FROM "TestEnvironment" WHERE id = $1', [environmentId]);
  await pool.query('DELETE FROM "TestWorkflow" WHERE id = $1', [workflowId]);
  await pool.end();
}
