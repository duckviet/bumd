import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflowService = readFileSync(
  new URL("../apps/backend/src/test-workflows/test-workflows.service.ts", import.meta.url),
  "utf8",
);
const runService = readFileSync(
  new URL("../apps/backend/src/test-workflows/test-workflow-runs.service.ts", import.meta.url),
  "utf8",
);
const runRepository = readFileSync(
  new URL("../apps/backend/src/test-workflows/test-workflow-run-repository.ts", import.meta.url),
  "utf8",
);
const runDto = readFileSync(
  new URL("../apps/backend/src/test-workflows/test-workflow-run-dto.ts", import.meta.url),
  "utf8",
);
const runController = readFileSync(
  new URL("../apps/backend/src/test-workflows/test-workflow-runs.controller.ts", import.meta.url),
  "utf8",
);

test("workflow metadata DTOs normalize valid tags and reject malformed metadata", async () => {
  const { WorkflowMetadataSchema } = await import(
    "../apps/backend/src/test-workflows/test-workflow-definition.schema.ts"
  );

  const created = WorkflowMetadataSchema.parse({
    tags: [" Smoke ", "payments", "SMOKE"],
    priority: "critical",
    type: "end_to_end",
  });
  assert.deepEqual(created.tags, ["smoke", "payments"]);
  assert.equal(created.priority, "critical");
  assert.equal(created.type, "end_to_end");
  assert.equal(WorkflowMetadataSchema.safeParse({ tags: [], priority: "urgent", type: "smoke" }).success, false);
  assert.equal(WorkflowMetadataSchema.safeParse({ tags: [], priority: "low", type: "unit" }).success, false);
  assert.equal(WorkflowMetadataSchema.safeParse({ tags: ["ok", 3], priority: "low", type: "smoke" }).success, false);
});

test("workflow SQL remains tenant scoped and revision conflicts remain explicit", () => {
  assert.match(workflowService, /WHERE id = \$1 AND "organizationId" = \$2 AND "docId" = \$3 AND "branchId" = \$4/u);
  assert.match(workflowService, /existing\.revision !== dto\.expectedRevision/u);
  assert.match(workflowService, /TestWorkflowErrorCode\.WorkflowConflict,\s*409/u);
  assert.match(workflowService, /revision = \$6/u);
  assert.match(workflowService, /result\.rows\.length === 0[\s\S]*?WorkflowConflict/u);
  assert.match(workflowService, /WorkflowTagsSchema\.parse/u);
  assert.match(runRepository, /"metadataSnapshotJson", "environmentSnapshotJson"/u);
  assert.match(runService, /parseAndValidateDefinition\(workflow\.definitionJson\)/u);
  assert.match(runService, /loadEncryptedEnvironmentSnapshot/u);
  assert.match(runRepository, /"organizationId" = \$3/u);
  assert.match(runRepository, /"docId" = \$4 AND "branchId" = \$5/u);
  assert.match(runController, /listRuns\(\{\s*organizationId,\s*docId,\s*branchId,/u);
  assert.match(runController, /getRun\(\{ organizationId, docId, branchId, workflowId, runId \}\)/u);
  assert.match(runController, /cancelRun\(\{ organizationId, docId, branchId, workflowId, runId \}\)/u);
});

test("run snapshot responses expose descriptors without encrypted values", async () => {
  const { parseStepPhase, sanitizeEnvironmentSnapshot, sanitizeStepInputs } = await import(
    "../apps/backend/src/test-workflows/test-workflow-snapshots.ts"
  );
  const response = sanitizeEnvironmentSnapshot({
    id: "tenv_a",
    name: "Production",
    variables: [
      { id: "tev_a", key: "TOKEN", encryptedValue: "enc:test_ciphertext", secret: true },
      { id: "tev_b", key: "BASE_URL", encryptedValue: null, secret: false },
    ],
  });
  assert.deepEqual(response, {
    id: "tenv_a",
    name: "Production",
    variables: [
      { id: "tev_a", key: "TOKEN", secret: true, hasValue: true },
      { id: "tev_b", key: "BASE_URL", secret: false, hasValue: false },
    ],
  });
  assert.doesNotMatch(JSON.stringify(response), /ciphertext|encryptedValue|enc:/u);

  const inputs = sanitizeStepInputs([
    { type: "env", key: "TOKEN", value: "test_raw_secret" },
    { type: "env", key: "BASE_URL", value: "https://snapshot.example" },
    { type: "data", key: "accountId", value: 42 },
    { type: "var", name: "resourceId", value: "resource-123" },
    { type: "data", key: 9, value: "malformed" },
    { type: "ciphertext", encryptedValue: "enc:test_ciphertext" },
  ], new Set(["TOKEN"]));
  assert.deepEqual(inputs, [
    { type: "env", key: "TOKEN", value: "[REDACTED]" },
    { type: "env", key: "BASE_URL", value: "https://snapshot.example" },
    { type: "data", key: "accountId", value: 42 },
    { type: "var", name: "resourceId", value: "resource-123" },
  ]);
  assert.doesNotMatch(JSON.stringify(inputs), /test_raw_secret|test_ciphertext|encryptedValue|enc:/u);
  assert.equal(parseStepPhase("teardown"), "teardown");
  assert.throws(() => parseStepPhase("cleanup"));
});

test("run detail maps immutable metadata, environment, and every execution phase", () => {
  assert.match(runDto, /metadataSnapshot: WorkflowMetadataSchema\.parse\(run\.metadataSnapshotJson\)/u);
  assert.match(runDto, /parseEncryptedEnvironmentSnapshot\(run\.environmentSnapshotJson\)/u);
  assert.match(runDto, /sanitizeEnvironmentSnapshot\(environmentSnapshot\)/u);
  assert.match(runDto, /phase: parseStepPhase\(step\.phase\)/u);
  assert.match(runDto, /sanitizeStepInputs\(step\.inputsJson/u);
});

test("Fastify enforces run route scope and atomic expectedRevision updates", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--env-file=.env",
      "--loader",
      "./tests/fixtures/typescript-source-loader.mjs",
      "./tests/fixtures/test-workflow-isolation-live.mjs",
    ],
    { cwd: process.cwd(), encoding: "utf8", env: process.env, timeout: 30_000 },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(
    `${result.stdout}\n${result.stderr}`,
    /test_raw_secret|test_ciphertext|encryptedValue|enc:/u,
  );
  const output = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.deepEqual(output.concurrentStatuses, [200, 409]);
  assert.equal(output.revision, 2);
  assert.equal(output.correctDetail, 200);
  assert.equal(output.foreignDetail, 404);
  assert.equal(output.foreignListCount, 0);
  assert.equal(output.foreignCancel, 404);
  assert.equal(output.markerLeaked, false);
  assert.equal(output.snapshotSanitized, true);
  assert.deepEqual(output.phases, ["setup", "test", "teardown"]);
  assert.equal(output.primaryError, "ASSERTION_FAILED");
});
