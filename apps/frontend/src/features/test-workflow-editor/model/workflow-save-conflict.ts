import type { WorkflowEditorAction } from "./workflow-editor-state.ts";
import { TestWorkflowApiError } from "../../../shared/api/test-workflow-api-error.ts";

export function saveFailureAction(error: unknown): WorkflowEditorAction {
  if (
    error instanceof TestWorkflowApiError
    && error.status === 409
    && error.code === "WORKFLOW_CONFLICT"
  ) {
    return { type: "SAVE_CONFLICT", currentRevision: error.currentRevision };
  }
  return { type: "SAVE_FAILURE", error: "Unable to save workflow settings. Try again." };
}
