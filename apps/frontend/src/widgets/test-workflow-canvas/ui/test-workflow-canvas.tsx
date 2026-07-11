"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { WorkflowEditorStore } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import type { PaletteOperation } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";
import { EndpointNode } from "@/widgets/test-workflow-canvas/ui/endpoint-node";

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
        stroke: selectedEdgeId === e.id ? "#ff682c" : "#d9dedb",
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
        const op = JSON.parse(rawData) as PaletteOperation;

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
            position,
            requestTemplate: {},
            exports: [],
            assertions: [
              { id: `assert_${generateId()}`, type: "status", operator: "equals", expected: 200 },
            ],
          },
        });
      } catch (err) {
        console.error("Failed to add dropped node:", err);
      }
    },
    [dispatch],
  );

  // Sync node position dragging
  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
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
        alert("Cycle detected! Workflows must be directed acyclic graphs.");
        return;
      }

      dispatch({
        type: "ADD_EDGE",
        edge: {
          id: `edge_${generateId()}`,
          source: connection.source,
          target: connection.target,
        },
      });
    },
    [definition.edges, dispatch],
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
        <Background color="#ccc" gap={16} />
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
