"use client";

import { useCallback, useRef } from "react";
import type { WorkflowEditorStore } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import { createRun, getRun } from "@/shared/api/test-workflows-client";

export function useRunWorkflow(
  orgSlug: string,
  docSlug: string,
  branchSlug: string,
  store: WorkflowEditorStore,
  saveFn: () => Promise<boolean>,
) {
  const { state, dispatch } = store;
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    dispatch({ type: "RUN_FINISH" });
  }, [dispatch]);

  const run = useCallback(async (environmentId: string | null): Promise<void> => {
    if (!state.workflowId) return;

    // 1. Save if dirty
    if (state.dirty) {
      const saved = await saveFn();
      if (!saved) {
        // Save failed or had conflict, block run
        return;
      }
    }

    try {
      // 2. Create run
      const result = await createRun({
        orgSlug,
        docSlug,
        branchSlug,
        workflowId: state.workflowId,
        body: environmentId ? { environmentId } : {},
      });

      dispatch({ type: "RUN_START", runId: result.runId });

      // 3. Start polling
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
      }

      pollTimerRef.current = setInterval(async () => {
        try {
          const runStatus = await getRun({
            orgSlug,
            docSlug,
            branchSlug,
            workflowId: state.workflowId!,
            runId: result.runId,
          });

          dispatch({ type: "RUN_UPDATE", runStatus });

          // Terminal states check
          if (
            runStatus.status === "succeeded" ||
            runStatus.status === "failed" ||
            runStatus.status === "canceled"
          ) {
            stopPolling();
          }
        } catch (err) {
          console.error("Error polling workflow run status:", err);
          stopPolling();
        }
      }, 1000);
    } catch (err) {
      console.error("Failed to start workflow run:", err);
      dispatch({ type: "RUN_FINISH" });
    }
  }, [orgSlug, docSlug, branchSlug, state.workflowId, state.dirty, saveFn, dispatch, stopPolling]);

  return { run, stopPolling };
}
