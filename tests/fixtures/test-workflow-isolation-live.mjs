import assert from "node:assert/strict";
import pg from "pg";
import { createTestServer } from "../../apps/backend/src/testing/create-test-server.ts";

const { Pool } = pg;
delete process.env.REDIS_URL;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://bumd:bumd@localhost:5436/bumd",
});
const harness = await createTestServer();
const suffix = `${process.pid}_${Date.now()}`;
let workflowId;
let runId;

try {
  const tokenResponse = await harness.inject({
    method: "POST",
    url: "/v1/orgs/acme/api-tokens",
    headers: { Authorization: "Bearer test_admin_session_not_secret" },
    payload: { name: `todo2-${suffix}`, role: "admin", scopes: ["docs:read", "docs:deploy"] },
  });
  assert.equal(tokenResponse.statusCode, 201, tokenResponse.payload);
  const token = JSON.parse(tokenResponse.payload).token;
  const headers = { Authorization: `Bearer ${token}` };
  const payments = "/v1/orgs/acme/docs/payments/branches/main";
  const foreign = "/v1/orgs/acme/docs/empty/branches/main";
  const createResponse = await harness.inject({
    method: "POST",
    url: `${payments}/test-workflows`,
    headers,
    payload: { name: `CAS ${suffix}`, tags: ["isolation"], priority: "medium", type: "integration" },
  });
  assert.equal(createResponse.statusCode, 201, createResponse.payload);
  workflowId = JSON.parse(createResponse.payload).id;

  const updates = await Promise.all([
    harness.inject({
      method: "PATCH",
      url: `${payments}/test-workflows/${workflowId}`,
      headers,
      payload: { expectedRevision: 1, description: "winner-a" },
    }),
    harness.inject({
      method: "PATCH",
      url: `${payments}/test-workflows/${workflowId}`,
      headers,
      payload: { expectedRevision: 1, description: "winner-b" },
    }),
  ]);
  assert.deepEqual(updates.map((response) => response.statusCode).sort(), [200, 409]);
  const persisted = await pool.query(
    'SELECT revision, description FROM "TestWorkflow" WHERE id = $1',
    [workflowId],
  );
  assert.equal(persisted.rows[0].revision, 2);
  assert.ok(["winner-a", "winner-b"].includes(persisted.rows[0].description));

  runId = `twr_scope_${suffix}`;
  const marker = `scope_marker_${suffix}`;
  const rawSecret = `test_raw_secret_${suffix}`;
  const ciphertext = `enc:test_ciphertext_${suffix}`;
  const environmentSnapshot = {
    id: `tenv_snapshot_${suffix}`,
    name: "Historical environment",
    variables: [
      { id: `tenvv_token_${suffix}`, key: "TOKEN", encryptedValue: ciphertext, secret: true },
      { id: `tenvv_url_${suffix}`, key: "BASE_URL", encryptedValue: "enc:test_public_value", secret: false },
    ],
  };
  await pool.query(
    `INSERT INTO "TestWorkflowRun"
      (id, "workflowId", "organizationId", "docId", "branchId", "versionId", status,
       "definitionSnapshotJson", "metadataSnapshotJson", "environmentSnapshotJson",
       "errorCode", "errorMessage", "createdAt", "updatedAt")
     VALUES ($1, $2, 'org_acme', 'doc_payments', 'br_payments_main', 'ver_payments_1', 'queued',
       $3, '{"tags":["isolation"],"priority":"medium","type":"integration"}', $4,
       'ASSERTION_FAILED', 'Primary assertion failed', NOW(), NOW())`,
    [
      runId,
      workflowId,
      JSON.stringify({ schemaVersion: 2, context: { testData: { marker } }, nodes: [], edges: [] }),
      JSON.stringify(environmentSnapshot),
    ],
  );
  await pool.query(
    `INSERT INTO "TestWorkflowStepRun"
      (id, "runId", "nodeId", "operationId", phase, status, "inputsJson", "errorCode", "errorMessage", "createdAt", "updatedAt")
     VALUES
      ($1, $4, 'setup-node', 'setupOperation', 'setup', 'succeeded', '[]', NULL, NULL, NOW(), NOW()),
      ($2, $4, 'test-node', 'testOperation', 'test', 'failed', $5, 'ASSERTION_FAILED', 'failed', NOW(), NOW()),
      ($3, $4, 'cleanup-node', 'cleanupOperation', 'teardown', 'failed', '[]', 'REQUEST_FAILED', 'cleanup failed', NOW(), NOW())`,
    [
      `tws_setup_${suffix}`,
      `tws_test_${suffix}`,
      `tws_cleanup_${suffix}`,
      runId,
      JSON.stringify([
        { type: "env", key: "TOKEN", value: rawSecret },
        { type: "data", key: "accountId", value: 42 },
      ]),
    ],
  );

  const correctDetail = await harness.inject({
    method: "GET",
    url: `${payments}/test-workflows/${workflowId}/runs/${runId}`,
    headers,
  });
  assert.equal(correctDetail.statusCode, 200, correctDetail.payload);
  assert.match(correctDetail.payload, new RegExp(marker, "u"));
  const detail = JSON.parse(correctDetail.payload);
  assert.deepEqual(detail.metadataSnapshot, { tags: ["isolation"], priority: "medium", type: "integration" });
  assert.deepEqual(detail.environmentSnapshot, {
    id: environmentSnapshot.id,
    name: environmentSnapshot.name,
    variables: [
      { id: environmentSnapshot.variables[0].id, key: "TOKEN", secret: true, hasValue: true },
      { id: environmentSnapshot.variables[1].id, key: "BASE_URL", secret: false, hasValue: true },
    ],
  });
  assert.deepEqual(detail.steps.map((step) => step.phase), ["setup", "test", "teardown"]);
  assert.deepEqual(detail.steps[1].inputs, [
    { type: "env", key: "TOKEN", value: "[REDACTED]" },
    { type: "data", key: "accountId", value: 42 },
  ]);
  assert.deepEqual(detail.error, { code: "ASSERTION_FAILED", message: "Primary assertion failed" });
  assert.doesNotMatch(correctDetail.payload, new RegExp(`${rawSecret}|${ciphertext}|encryptedValue`, "u"));

  const foreignDetail = await harness.inject({
    method: "GET",
    url: `${foreign}/test-workflows/${workflowId}/runs/${runId}`,
    headers,
  });
  assert.equal(foreignDetail.statusCode, 404, foreignDetail.payload);
  assert.doesNotMatch(foreignDetail.payload, new RegExp(marker, "u"));

  const foreignList = await harness.inject({
    method: "GET",
    url: `${foreign}/test-workflows/${workflowId}/runs`,
    headers,
  });
  assert.equal(foreignList.statusCode, 200, foreignList.payload);
  assert.deepEqual(JSON.parse(foreignList.payload).items, []);
  assert.doesNotMatch(foreignList.payload, new RegExp(runId, "u"));

  const foreignCancel = await harness.inject({
    method: "POST",
    url: `${foreign}/test-workflows/${workflowId}/runs/${runId}/cancel`,
    headers,
  });
  assert.equal(foreignCancel.statusCode, 404, foreignCancel.payload);
  const runState = await pool.query(
    'SELECT "cancelRequestedAt" FROM "TestWorkflowRun" WHERE id = $1',
    [runId],
  );
  assert.equal(runState.rows[0].cancelRequestedAt, null);

  process.stdout.write(`${JSON.stringify({
    concurrentStatuses: updates.map((response) => response.statusCode).sort(),
    revision: persisted.rows[0].revision,
    correctDetail: correctDetail.statusCode,
    foreignDetail: foreignDetail.statusCode,
    foreignListCount: JSON.parse(foreignList.payload).items.length,
    foreignCancel: foreignCancel.statusCode,
    markerLeaked: false,
    snapshotSanitized: true,
    phases: detail.steps.map((step) => step.phase),
    primaryError: detail.error.code,
  })}\n`);
} finally {
  if (runId) await pool.query('DELETE FROM "TestWorkflowRun" WHERE id = $1', [runId]);
  if (workflowId) await pool.query('DELETE FROM "TestWorkflow" WHERE id = $1', [workflowId]);
  await pool.end();
  await harness.close();
}
