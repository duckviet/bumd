"use client";

import { useCallback } from "react";
import type { WorkflowEditorStore } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import { updateWorkflow } from "@/shared/api/test-workflows-client";

export function useSaveWorkflow(
  orgSlug: string,
  docSlug: string,
  branchSlug: string,
  store: WorkflowEditorStore,
) {
  const { state, dispatch } = store;

  const save = useCallback(async (): Promise<boolean> => {
    if (!state.workflowId) return false;
    dispatch({ type: "SAVE_START" });

    try {
      const updated = await updateWorkflow({
        orgSlug,
        docSlug,
        branchSlug,
        workflowId: state.workflowId,
        body: {
          expectedRevision: state.revision,
          definitionJson: state.definition,
        },
      });

      dispatch({ type: "SAVE_SUCCESS", revision: updated.revision });
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed.error && parsed.error.code === "WORKFLOW_CONFLICT") {
          dispatch({ type: "SAVE_CONFLICT", currentRevision: parsed.error.currentRevision || state.revision });
          return false;
        }
      } catch {
        // Fallback to general failure
      }

      dispatch({ type: "SAVE_FAILURE", error: errorMsg });
      return false;
    }
  }, [orgSlug, docSlug, branchSlug, state.workflowId, state.revision, state.definition, dispatch]);

  return save;
}
