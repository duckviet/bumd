"use client";

import { useMemo, useReducer } from "react";
import {
  createInitialEditorState,
  workflowEditorReducer,
} from "@/features/test-workflow-editor/model/workflow-editor-state";

export type { TestWorkflowEditorState, WorkflowEditorAction } from "@/features/test-workflow-editor/model/workflow-editor-state";

export function useWorkflowEditorStore() {
  const [state, dispatch] = useReducer(workflowEditorReducer, undefined, createInitialEditorState);
  return useMemo(() => ({ state, dispatch }), [state]);
}

export type WorkflowEditorStore = ReturnType<typeof useWorkflowEditorStore>;
