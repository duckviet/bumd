import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createInitialEditorState,
  workflowEditorReducer,
} from "../../apps/frontend/src/features/test-workflow-editor/model/workflow-editor-state.ts";
import { saveFailureAction } from "../../apps/frontend/src/features/test-workflow-editor/model/workflow-save-conflict.ts";
import {
  TestWorkflowApiError,
  updateWorkflow,
} from "../../apps/frontend/src/shared/api/test-workflows-client.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("feature slices do not compose workflow widgets", () => {
  const featureDirectory = path.join(rootDir, "apps/frontend/src/features/test-workflow-editor");
  const featureSource = fs.globSync("**/*.{ts,tsx}", { cwd: featureDirectory })
    .map((name) => fs.readFileSync(path.join(featureDirectory, name), "utf8"))
    .join("\n");
  const pageSource = fs.readFileSync(
    path.join(rootDir, "apps/frontend/src/page/dashboard-tests/workflow/ui/tests-page-client.tsx"),
    "utf8",
  );

  assert.doesNotMatch(featureSource, /from "@\/widgets\//u);
  assert.match(pageSource, /from "\.\/workflow-editor-workspace"/u);
});

test("HTTP 409 WORKFLOW_CONFLICT without a revision dispatches conflict state", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { code: "WORKFLOW_CONFLICT", message: "Revision changed" } }),
    { status: 409, headers: { "content-type": "application/json" } },
  );

  try {
    let apiError;
    await assert.rejects(
      updateWorkflow({
        orgSlug: "org",
        docSlug: "doc",
        branchSlug: "main",
        workflowId: "workflow-one",
        body: { expectedRevision: 3 },
      }),
      (error) => {
        apiError = error;
        return error instanceof TestWorkflowApiError
          && error.status === 409
          && error.code === "WORKFLOW_CONFLICT"
          && error.currentRevision === null;
      },
    );
    const action = saveFailureAction(apiError);
    assert.deepEqual(action, { type: "SAVE_CONFLICT", currentRevision: null });
    const conflicted = workflowEditorReducer({ ...createInitialEditorState(), saving: true }, action);
    assert.equal(conflicted.saving, false);
    assert.equal(conflicted.hasSaveConflict, true);
    assert.equal(conflicted.conflictRevision, null);
    assert.equal(conflicted.saveError, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
