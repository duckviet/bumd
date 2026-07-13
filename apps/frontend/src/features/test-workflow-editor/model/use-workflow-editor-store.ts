"use client";

import { useReducer, useMemo } from "react";
import type {
  TestWorkflowDefinition,
  TestWorkflowNode,
  TestWorkflowEdge,
  TestWorkflowRequestTemplate,
  TestWorkflowExport,
  TestWorkflowAssertion,
  TestWorkflowRunDetailDto,
  TestWorkflowDto,
} from "@/entities/test-workflow";

export type TestWorkflowEditorState = {
  readonly workflowId?: string;
  readonly revision: number;
  readonly definition: TestWorkflowDefinition;
  readonly selectedNodeId: string | null;
  readonly selectedEdgeId: string | null;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saveError: string | null;
  readonly conflictRevision: number | null;
  readonly running: boolean;
  readonly currentRunId: string | null;
  readonly runStatus: TestWorkflowRunDetailDto | null;
  readonly lastSavedAt: string | null;
  readonly defaultServerUrl?: string | undefined;
};

type Action =
  | { type: "LOAD_WORKFLOW"; workflow: TestWorkflowDto; defaultServerUrl?: string | undefined }
  | { type: "SET_NODES"; nodes: readonly TestWorkflowNode[] }
  | { type: "SET_EDGES"; edges: readonly TestWorkflowEdge[] }
  | { type: "SELECT_NODE"; nodeId: string }
  | { type: "SELECT_EDGE"; edgeId: string }
  | { type: "DESELECT" }
  | { type: "UPDATE_NODE_TEMPLATE"; nodeId: string; template: TestWorkflowRequestTemplate }
  | { type: "UPDATE_NODE_EXPORTS"; nodeId: string; exports: readonly TestWorkflowExport[] }
  | { type: "UPDATE_NODE_ASSERTIONS"; nodeId: string; assertions: readonly TestWorkflowAssertion[] }
  | { type: "ADD_NODE"; node: TestWorkflowNode }
  | { type: "REMOVE_NODE"; nodeId: string }
  | { type: "ADD_EDGE"; edge: TestWorkflowEdge }
  | { type: "REMOVE_EDGE"; edgeId: string }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; revision: number }
  | { type: "SAVE_FAILURE"; error: string }
  | { type: "SAVE_CONFLICT"; currentRevision: number }
  | { type: "RUN_START"; runId: string }
  | { type: "RUN_UPDATE"; runStatus: TestWorkflowRunDetailDto }
  | { type: "RUN_FINISH" };

const initialState: TestWorkflowEditorState = {
  revision: 1,
  definition: { schemaVersion: 1, nodes: [], edges: [] },
  selectedNodeId: null,
  selectedEdgeId: null,
  dirty: false,
  saving: false,
  saveError: null,
  conflictRevision: null,
  running: false,
  currentRunId: null,
  runStatus: null,
  lastSavedAt: null,
  defaultServerUrl: undefined,
};

function reducer(state: TestWorkflowEditorState, action: Action): TestWorkflowEditorState {
  switch (action.type) {
    case "LOAD_WORKFLOW": {
      const definition = action.workflow.definitionJson;
      const hasAnyServerUrl = definition.nodes.some((n) => n.requestTemplate?.serverUrl);
      const updatedNodes =
        !hasAnyServerUrl && action.defaultServerUrl
          ? definition.nodes.map((n) => ({
              ...n,
              requestTemplate: {
                ...n.requestTemplate,
                serverUrl: action.defaultServerUrl,
              },
            }))
          : definition.nodes;

      return {
        ...state,
        workflowId: action.workflow.id,
        revision: action.workflow.revision,
        definition: {
          ...definition,
          nodes: updatedNodes,
        },
        defaultServerUrl: action.defaultServerUrl ?? state.defaultServerUrl,
        dirty: !hasAnyServerUrl && !!action.defaultServerUrl && definition.nodes.length > 0,
        saving: false,
        saveError: null,
        conflictRevision: null,
        selectedNodeId: null,
        selectedEdgeId: null,
        runStatus: null,
        currentRunId: null,
        running: false,
      };
    }

    case "SET_NODES":
      return {
        ...state,
        definition: { ...state.definition, nodes: action.nodes },
        dirty: true,
      };

    case "SET_EDGES":
      return {
        ...state,
        definition: { ...state.definition, edges: action.edges },
        dirty: true,
      };

    case "SELECT_NODE":
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectedEdgeId: null,
      };

    case "SELECT_EDGE":
      return {
        ...state,
        selectedEdgeId: action.edgeId,
        selectedNodeId: null,
      };

    case "DESELECT":
      return {
        ...state,
        selectedNodeId: null,
        selectedEdgeId: null,
      };

    case "UPDATE_NODE_TEMPLATE": {
      const updatedServerUrl = action.template.serverUrl;
      return {
        ...state,
        definition: {
          ...state.definition,
          nodes: state.definition.nodes.map((n) => {
            const nextTemplate =
              n.id === action.nodeId
                ? action.template
                : { ...n.requestTemplate, serverUrl: updatedServerUrl };
            return { ...n, requestTemplate: nextTemplate };
          }),
        },
        dirty: true,
      };
    }

    case "UPDATE_NODE_EXPORTS":
      return {
        ...state,
        definition: {
          ...state.definition,
          nodes: state.definition.nodes.map((n) =>
            n.id === action.nodeId ? { ...n, exports: action.exports } : n,
          ),
        },
        dirty: true,
      };

    case "UPDATE_NODE_ASSERTIONS":
      return {
        ...state,
        definition: {
          ...state.definition,
          nodes: state.definition.nodes.map((n) =>
            n.id === action.nodeId ? { ...n, assertions: action.assertions } : n,
          ),
        },
        dirty: true,
      };

    case "ADD_NODE": {
      const existingServerUrl = state.definition.nodes.find(
        (n) => n.requestTemplate?.serverUrl,
      )?.requestTemplate?.serverUrl;
      const newNode = {
        ...action.node,
        requestTemplate: {
          ...action.node.requestTemplate,
          serverUrl: existingServerUrl ?? state.defaultServerUrl ?? action.node.requestTemplate?.serverUrl,
        },
      };
      return {
        ...state,
        definition: {
          ...state.definition,
          nodes: [...state.definition.nodes, newNode],
        },
        dirty: true,
      };
    }

    case "REMOVE_NODE":
      return {
        ...state,
        definition: {
          ...state.definition,
          nodes: state.definition.nodes.filter((n) => n.id !== action.nodeId),
          edges: state.definition.edges.filter((e) => e.source !== action.nodeId && e.target !== action.nodeId),
        },
        selectedNodeId: state.selectedNodeId === action.nodeId ? null : state.selectedNodeId,
        dirty: true,
      };

    case "ADD_EDGE":
      return {
        ...state,
        definition: {
          ...state.definition,
          edges: [...state.definition.edges, action.edge],
        },
        dirty: true,
      };

    case "REMOVE_EDGE":
      return {
        ...state,
        definition: {
          ...state.definition,
          edges: state.definition.edges.filter((e) => e.id !== action.edgeId),
        },
        selectedEdgeId: state.selectedEdgeId === action.edgeId ? null : state.selectedEdgeId,
        dirty: true,
      };

    case "SAVE_START":
      return {
        ...state,
        saving: true,
        saveError: null,
        conflictRevision: null,
      };

    case "SAVE_SUCCESS":
      return {
        ...state,
        revision: action.revision,
        saving: false,
        dirty: false,
        lastSavedAt: new Date().toLocaleTimeString(),
      };

    case "SAVE_FAILURE":
      return {
        ...state,
        saving: false,
        saveError: action.error,
      };

    case "SAVE_CONFLICT":
      return {
        ...state,
        saving: false,
        conflictRevision: action.currentRevision,
      };

    case "RUN_START":
      return {
        ...state,
        running: true,
        currentRunId: action.runId,
        runStatus: null,
      };

    case "RUN_UPDATE":
      return {
        ...state,
        runStatus: action.runStatus,
      };

    case "RUN_FINISH":
      return {
        ...state,
        running: false,
      };

    default:
      return state;
  }
}

export function useWorkflowEditorStore() {
  const [state, dispatch] = useReducer(reducer, initialState);
  return useMemo(() => ({ state, dispatch }), [state, dispatch]);
}
export type WorkflowEditorStore = ReturnType<typeof useWorkflowEditorStore>;
