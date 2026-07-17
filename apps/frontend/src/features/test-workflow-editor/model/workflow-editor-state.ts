import type {
  JsonValue,
  TestWorkflowAssertion,
  TestWorkflowDefinition,
  TestWorkflowDto,
  TestWorkflowEdge,
  TestWorkflowExport,
  TestWorkflowMetadata,
  TestWorkflowNode,
  TestWorkflowRequestTemplate,
  TestWorkflowRunDetailDto,
} from "../../../shared/api/test-workflow-types.ts";

export type TestWorkflowEditorState = {
  readonly workflowId?: string;
  readonly name: string;
  readonly description: string | null;
  readonly metadata: TestWorkflowMetadata;
  readonly revision: number;
  readonly definition: TestWorkflowDefinition;
  readonly selectedNodeId: string | null;
  readonly selectedEdgeId: string | null;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saveError: string | null;
  readonly hasSaveConflict: boolean;
  readonly conflictRevision: number | null;
  readonly running: boolean;
  readonly currentRunId: string | null;
  readonly runStatus: TestWorkflowRunDetailDto | null;
  readonly lastSavedAt: string | null;
  readonly defaultServerUrl?: string | undefined;
};

export type WorkflowEditorAction =
  | { readonly type: "LOAD_WORKFLOW"; readonly workflow: TestWorkflowDto; readonly defaultServerUrl?: string | undefined }
  | { readonly type: "UPDATE_SETTINGS"; readonly settings: {
      readonly name: string;
      readonly description: string | null;
      readonly tags: readonly string[];
      readonly priority: TestWorkflowMetadata["priority"];
      readonly type: TestWorkflowMetadata["type"];
      readonly testData: Readonly<Record<string, JsonValue>>;
    } }
  | { readonly type: "SET_NODES"; readonly nodes: readonly TestWorkflowNode[] }
  | { readonly type: "SET_EDGES"; readonly edges: readonly TestWorkflowEdge[] }
  | { readonly type: "SELECT_NODE"; readonly nodeId: string }
  | { readonly type: "SELECT_EDGE"; readonly edgeId: string }
  | { readonly type: "DESELECT" }
  | { readonly type: "UPDATE_NODE_TEMPLATE"; readonly nodeId: string; readonly template: TestWorkflowRequestTemplate }
  | { readonly type: "UPDATE_NODE_EXPORTS"; readonly nodeId: string; readonly exports: readonly TestWorkflowExport[] }
  | { readonly type: "UPDATE_NODE_ASSERTIONS"; readonly nodeId: string; readonly assertions: readonly TestWorkflowAssertion[] }
  | { readonly type: "ADD_NODE"; readonly node: Omit<TestWorkflowNode, "phase"> & { readonly phase?: TestWorkflowNode["phase"] } }
  | { readonly type: "REMOVE_NODE"; readonly nodeId: string }
  | { readonly type: "ADD_EDGE"; readonly edge: TestWorkflowEdge }
  | { readonly type: "REMOVE_EDGE"; readonly edgeId: string }
  | { readonly type: "SAVE_START" }
  | { readonly type: "SAVE_SUCCESS"; readonly workflow: TestWorkflowDto }
  | { readonly type: "SAVE_FAILURE"; readonly error: string }
  | { readonly type: "SAVE_CONFLICT"; readonly currentRevision: number | null }
  | { readonly type: "RUN_START"; readonly runId: string }
  | { readonly type: "RUN_UPDATE"; readonly runStatus: TestWorkflowRunDetailDto }
  | { readonly type: "RUN_FINISH" };

export function createInitialEditorState(): TestWorkflowEditorState {
  return {
    name: "",
    description: null,
    metadata: { tags: [], priority: "medium", type: "integration" },
    revision: 1,
    definition: { schemaVersion: 2, context: { testData: {} }, nodes: [], edges: [] },
    selectedNodeId: null,
    selectedEdgeId: null,
    dirty: false,
    saving: false,
    saveError: null,
    hasSaveConflict: false,
    conflictRevision: null,
    running: false,
    currentRunId: null,
    runStatus: null,
    lastSavedAt: null,
  };
}

function loadWorkflow(state: TestWorkflowEditorState, workflow: TestWorkflowDto, defaultServerUrl?: string): TestWorkflowEditorState {
  const hasServerUrl = workflow.definitionJson.nodes.some((node) => Boolean(node.requestTemplate.serverUrl));
  const applyDefault = !hasServerUrl && Boolean(defaultServerUrl) && workflow.definitionJson.nodes.length > 0;
  const nodes = applyDefault
    ? workflow.definitionJson.nodes.map((node) => ({
        ...node,
        requestTemplate: { ...node.requestTemplate, serverUrl: defaultServerUrl },
      }))
    : workflow.definitionJson.nodes;
  return {
    ...state,
    workflowId: workflow.id,
    name: workflow.name,
    description: workflow.description,
    metadata: { tags: workflow.tags, priority: workflow.priority, type: workflow.type },
    revision: workflow.revision,
    definition: {
      ...workflow.definitionJson,
      context: workflow.definitionJson.context ?? { testData: {} },
      nodes,
    },
    defaultServerUrl: defaultServerUrl ?? state.defaultServerUrl,
    dirty: applyDefault,
    saving: false,
    saveError: null,
    hasSaveConflict: false,
    conflictRevision: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    runStatus: null,
    currentRunId: null,
    running: false,
    lastSavedAt: null,
  };
}

function updateNodes(state: TestWorkflowEditorState, nodes: readonly TestWorkflowNode[]): TestWorkflowEditorState {
  return { ...state, definition: { ...state.definition, nodes }, dirty: true };
}

export function workflowEditorReducer(state: TestWorkflowEditorState, action: WorkflowEditorAction): TestWorkflowEditorState {
  switch (action.type) {
    case "LOAD_WORKFLOW":
      return loadWorkflow(state, action.workflow, action.defaultServerUrl);
    case "UPDATE_SETTINGS":
      return {
        ...state,
        name: action.settings.name,
        description: action.settings.description,
        metadata: {
          tags: action.settings.tags,
          priority: action.settings.priority,
          type: action.settings.type,
        },
        definition: { ...state.definition, context: { testData: action.settings.testData } },
        dirty: true,
      };
    case "SET_NODES":
      return updateNodes(state, action.nodes);
    case "SET_EDGES":
      return { ...state, definition: { ...state.definition, edges: action.edges }, dirty: true };
    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.nodeId, selectedEdgeId: null };
    case "SELECT_EDGE":
      return { ...state, selectedEdgeId: action.edgeId, selectedNodeId: null };
    case "DESELECT":
      return { ...state, selectedNodeId: null, selectedEdgeId: null };
    case "UPDATE_NODE_TEMPLATE": {
      const nodes = state.definition.nodes.map((node) => ({
        ...node,
        requestTemplate: node.id === action.nodeId
          ? action.template
          : { ...node.requestTemplate, serverUrl: action.template.serverUrl },
      }));
      return updateNodes(state, nodes);
    }
    case "UPDATE_NODE_EXPORTS":
      return updateNodes(state, state.definition.nodes.map((node) =>
        node.id === action.nodeId ? { ...node, exports: action.exports } : node));
    case "UPDATE_NODE_ASSERTIONS":
      return updateNodes(state, state.definition.nodes.map((node) =>
        node.id === action.nodeId ? { ...node, assertions: action.assertions } : node));
    case "ADD_NODE": {
      const serverUrl = state.definition.nodes.find((node) => node.requestTemplate.serverUrl)?.requestTemplate.serverUrl;
      const node = {
        ...action.node,
        phase: action.node.phase ?? "test",
        requestTemplate: {
          ...action.node.requestTemplate,
          serverUrl: serverUrl ?? state.defaultServerUrl ?? action.node.requestTemplate.serverUrl,
        },
      };
      return updateNodes(state, [...state.definition.nodes, node]);
    }
    case "REMOVE_NODE":
      return {
        ...updateNodes(state, state.definition.nodes.filter((node) => node.id !== action.nodeId)),
        definition: {
          ...state.definition,
          nodes: state.definition.nodes.filter((node) => node.id !== action.nodeId),
          edges: state.definition.edges.filter((edge) => edge.source !== action.nodeId && edge.target !== action.nodeId),
        },
        selectedNodeId: state.selectedNodeId === action.nodeId ? null : state.selectedNodeId,
      };
    case "ADD_EDGE":
      return { ...state, definition: { ...state.definition, edges: [...state.definition.edges, action.edge] }, dirty: true };
    case "REMOVE_EDGE":
      return {
        ...state,
        definition: { ...state.definition, edges: state.definition.edges.filter((edge) => edge.id !== action.edgeId) },
        selectedEdgeId: state.selectedEdgeId === action.edgeId ? null : state.selectedEdgeId,
        dirty: true,
      };
    case "SAVE_START":
      return { ...state, saving: true, saveError: null, hasSaveConflict: false, conflictRevision: null };
    case "SAVE_SUCCESS":
      return { ...loadWorkflow(state, action.workflow, state.defaultServerUrl), lastSavedAt: new Date().toLocaleTimeString() };
    case "SAVE_FAILURE":
      return { ...state, saving: false, saveError: action.error };
    case "SAVE_CONFLICT":
      return { ...state, saving: false, saveError: null, hasSaveConflict: true, conflictRevision: action.currentRevision };
    case "RUN_START":
      return { ...state, running: true, currentRunId: action.runId, runStatus: null };
    case "RUN_UPDATE":
      return { ...state, runStatus: action.runStatus };
    case "RUN_FINISH":
      return { ...state, running: false };
  }
}
