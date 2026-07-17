"use client";

import { useMemo, useCallback, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { WorkflowEditorStore } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import type { PaletteOperation } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";
import { EndpointNode } from "@/widgets/test-workflow-canvas/ui/endpoint-node";
import {
  getPhaseBadgeClass,
  getPhaseConnectionError,
  workflowPhases,
} from "@/features/test-workflow-editor/model/workflow-phases";

function generateId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);
}

const nodeTypes = {
  endpoint: EndpointNode,
};

type TestWorkflowCanvasProps = {
  readonly store: WorkflowEditorStore;
  readonly operations: readonly PaletteOperation[];
};

export function TestWorkflowCanvas({ store, operations }: TestWorkflowCanvasProps) {
  const { state, dispatch } = store;
  const { definition, selectedNodeId, selectedEdgeId, runStatus } = state;
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // React Flow nodes mapping
  const nodes = useMemo(() => {
    return definition.nodes.map((n) => ({
      id: n.id,
      type: "endpoint",
      position: n.position,
      data: {
        label: n.label,
        method: n.method,
        path: n.path,
        operationId: n.operationId,
        phase: n.phase,
        status: runStatus?.steps.find((s) => s.nodeId === n.id)?.status,
        isStale: !operations.some((op) => op.operationId === n.operationId),
        isSelected: selectedNodeId === n.id,
      },
    }));
  }, [definition.nodes, runStatus, operations, selectedNodeId]);

  // React Flow edges mapping
  const edges = useMemo(() => {
    return definition.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: runStatus?.steps.find((s) => s.nodeId === e.source)?.status === "succeeded",
      style: {
        stroke: selectedEdgeId === e.id ? "var(--color-signal-orange)" : "var(--color-chalk)",
        strokeWidth: selectedEdgeId === e.id ? 2.5 : 1.5,
      },
    }));
  }, [definition.edges, runStatus, selectedEdgeId]);

  // Handle drag over (React Flow drop zone check)
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle drop node onto canvas
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const rawData = event.dataTransfer.getData("application/reactflow");
      if (!rawData) return;

      try {
        const droppedOperation: unknown = JSON.parse(rawData);
        if (
          typeof droppedOperation !== "object"
          || droppedOperation === null
          || !("operationId" in droppedOperation)
          || typeof droppedOperation.operationId !== "string"
        ) {
          setConnectionError("That endpoint could not be added. Drag it from the endpoint palette again.");
          return;
        }
        const op = operations.find((operation) => operation.operationId === droppedOperation.operationId);
        if (!op) {
          setConnectionError("That endpoint is no longer available. Refresh the workflow and try again.");
          return;
        }

        // Position translation
        const reactFlowBounds = event.currentTarget.getBoundingClientRect();
        const position = {
          x: event.clientX - reactFlowBounds.left - 100,
          y: event.clientY - reactFlowBounds.top - 30,
        };

        dispatch({
          type: "ADD_NODE",
          node: {
            id: `node_${generateId()}`,
            type: "endpoint",
            operationId: op.operationId,
            method: op.method,
            path: op.path,
            label: op.summary || op.operationId,
            phase: "test",
            position,
            requestTemplate: {},
            exports: [],
            assertions: [
              { id: `assert_${generateId()}`, type: "status", operator: "equals", expected: 200 },
            ],
          },
        });
      } catch {
        setConnectionError("That endpoint could not be added. Drag it from the endpoint palette again.");
      }
    },
    [dispatch, operations],
  );

  // Sync node position dragging
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const updatedNodes = definition.nodes.map((n) =>
        n.id === node.id ? { ...n, position: node.position } : n,
      );
      dispatch({ type: "SET_NODES", nodes: updatedNodes });
    },
    [definition.nodes, dispatch],
  );

  // Handle connect edges (with cycle prevention)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      if (hasCycle(definition.edges, connection.source, connection.target)) {
        setConnectionError("That connection would create a cycle. Workflows must remain directed and acyclic.");
        return;
      }

      const phaseError = getPhaseConnectionError(definition.nodes, connection.source, connection.target);
      if (phaseError) {
        setConnectionError(phaseError);
        return;
      }

      setConnectionError(null);
      dispatch({
        type: "ADD_EDGE",
        edge: {
          id: `edge_${generateId()}`,
          source: connection.source,
          target: connection.target,
        },
      });
    },
    [definition.edges, definition.nodes, dispatch],
  );

  // Handle selection clicks
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      dispatch({ type: "SELECT_NODE", nodeId: node.id });
    },
    [dispatch],
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      dispatch({ type: "SELECT_EDGE", edgeId: edge.id });
    },
    [dispatch],
  );

  const onPaneClick = useCallback(() => {
    dispatch({ type: "DESELECT" });
  }, [dispatch]);

  // Edges delete support
  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      for (const e of edgesToDelete) {
        dispatch({ type: "REMOVE_EDGE", edgeId: e.id });
      }
    },
    [dispatch],
  );

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="w-full h-full relative"
    >
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 rounded border border-chalk bg-paper/95 px-2 py-1.5" aria-label="Phase legend">
        <span className="text-[10px] font-semibold text-slate">Phase legend</span>
        {workflowPhases.map((phase) => (
          <span key={phase.value} className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${getPhaseBadgeClass(phase.value)}`}>
            {phase.label}
          </span>
        ))}
      </div>
      {connectionError ? (
        <div role="alert" className="absolute bottom-3 left-1/2 z-10 w-[min(32rem,calc(100%-1.5rem))] -translate-x-1/2 rounded border border-sienna-bronze/40 bg-paper px-3 py-2 text-xs font-medium text-carbon">
          {connectionError}
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        fitView
      >
        <Background color="var(--color-chalk)" gap={16} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

function hasCycle(edges: readonly { readonly source: string; readonly target: string }[], source: string, target: string): boolean {
  if (source === target) return true;
  const visited = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (curr === source) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    const children = edges.filter((e) => e.source === curr).map((e) => e.target);
    for (const child of children) {
      stack.push(child);
    }
  }
  return false;
}
