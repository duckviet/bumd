"use client";

import { useCallback } from "react";
import type { WorkflowEditorStore } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import { updateWorkflow } from "@/shared/api/test-workflows-client";
import { buildWorkflowUpdateBody } from "@/features/test-workflow-editor/model/workflow-settings";
import { saveFailureAction } from "@/features/test-workflow-editor/model/workflow-save-conflict";

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
        body: buildWorkflowUpdateBody({
          revision: state.revision,
          definition: state.definition,
          settings: {
            name: state.name,
            description: state.description,
            tags: state.metadata.tags,
            priority: state.metadata.priority,
            type: state.metadata.type,
            testData: state.definition.context.testData,
          },
        }),
      });

      dispatch({ type: "SAVE_SUCCESS", workflow: updated });
      return true;
    } catch (err: unknown) {
      dispatch(saveFailureAction(err));
      return false;
    }
  }, [orgSlug, docSlug, branchSlug, state, dispatch]);

  return save;
}
