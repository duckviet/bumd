import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("saved test data failures have a stable domain code", async () => {
  const source = await readFile(
    new URL("../apps/backend/src/test-workflows/test-workflow-types.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /TestDataMissing:\s*"TEST_DATA_MISSING"/u);
});

test("workflow step errors preserve typed domain codes", async () => {
  const { TestWorkflowError } = await import(
    "../apps/backend/dist/test-workflows/test-workflow-errors.js"
  );
  const { TestWorkflowErrorCode } = await import(
    "../apps/backend/dist/test-workflows/test-workflow-types.js"
  );
  const { classifyWorkflowStepError } = await import(
    "../apps/backend/dist/test-workflows/runner/test-workflow-error-classifier.js"
  );

  const classified = classifyWorkflowStepError(
    new TestWorkflowError(TestWorkflowErrorCode.ExportFailed, 422, "Export failed"),
  );

  assert.deepEqual(classified, {
    code: TestWorkflowErrorCode.ExportFailed,
    message: "Export failed",
  });
});

test("workflow request errors map proxy policy and timeout codes explicitly", async () => {
  const { TryItOutError } = await import("../apps/backend/dist/try-it-out/try-it-out-errors.js");
  const { TestWorkflowErrorCode } = await import(
    "../apps/backend/dist/test-workflows/test-workflow-types.js"
  );
  const { classifyWorkflowStepError } = await import(
    "../apps/backend/dist/test-workflows/runner/test-workflow-error-classifier.js"
  );

  assert.equal(
    classifyWorkflowStepError(
      new TryItOutError("try_it_out_target_forbidden", "Target is forbidden", 403),
    ).code,
    TestWorkflowErrorCode.RequestBlocked,
  );
  assert.equal(
    classifyWorkflowStepError(
      new TryItOutError("try_it_out_timeout", "Request timed out", 504),
    ).code,
    TestWorkflowErrorCode.RequestTimeout,
  );
  assert.equal(
    classifyWorkflowStepError(new Error("Connection reset")).code,
    TestWorkflowErrorCode.RequestFailed,
  );
});

test("workflow interpolation failures expose domain codes without parsing messages", async () => {
  const { TestWorkflowError } = await import(
    "../apps/backend/dist/test-workflows/test-workflow-errors.js"
  );
  const { TestWorkflowErrorCode } = await import(
    "../apps/backend/dist/test-workflows/test-workflow-types.js"
  );
  const { interpolate } = await import(
    "../apps/backend/dist/test-workflows/runner/test-workflow-template.js"
  );

  assert.throws(
    () => interpolate("{{env.MISSING}}", { vars: {}, env: {}, secretKeys: new Set() }),
    (error) =>
      error instanceof TestWorkflowError && error.code === TestWorkflowErrorCode.EnvVarMissing,
  );
  assert.throws(
    () => interpolate("{{vars.missing}}", { vars: {}, env: {}, secretKeys: new Set() }),
    (error) =>
      error instanceof TestWorkflowError && error.code === TestWorkflowErrorCode.VarRefInvalid,
  );
});
