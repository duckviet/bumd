"use client";

import { useState, useCallback } from "react";
import type { TestEnvironmentDto, TestWorkflowNode } from "@/entities/test-workflow";
import type { WorkflowEditorStore } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import { NodeInspector } from "@/features/test-workflow-editor/ui/node-inspector";
import { RunConsole } from "@/features/test-workflow-run/ui/run-console";
import type { PaletteOperation } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";
import { EndpointPalette } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";
import { TestWorkflowCanvas } from "@/widgets/test-workflow-canvas/ui/test-workflow-canvas";

type WorkflowEditorWorkspaceProps = {
  readonly store: WorkflowEditorStore;
  readonly operations: readonly PaletteOperation[];
  readonly environment: TestEnvironmentDto | null;
  readonly isConsoleOpen: boolean;
  readonly setIsConsoleOpen: (open: boolean) => void;
};

export function WorkflowEditorWorkspace({
  store,
  operations,
  environment,
  isConsoleOpen,
  setIsConsoleOpen,
}: WorkflowEditorWorkspaceProps) {
  const { state, dispatch } = store;
  const [consoleHeight, setConsoleHeight] = useState(320);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = consoleHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(160, Math.min(800, startHeight - deltaY));
      setConsoleHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [consoleHeight]);

  const selectedNode = state.definition.nodes.find((node) => node.id === state.selectedNodeId);
  const isStale = selectedNode ? !operations.some((operation) => operation.operationId === selectedNode.operationId) : false;
  const updateNode = useCallback((nodeId: string, updates: Partial<TestWorkflowNode>) => {
    dispatch({
      type: "SET_NODES",
      nodes: state.definition.nodes.map((node) => node.id === nodeId ? { ...node, ...updates } : node),
    });
  }, [dispatch, state.definition.nodes]);
  const deleteNode = useCallback((nodeId: string) => dispatch({ type: "REMOVE_NODE", nodeId }), [dispatch]);

  return (
    <>
      <div className={`relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)] ${selectedNode ? "xl:grid-cols-[260px_minmax(0,1fr)_340px]" : "xl:grid-cols-[260px_minmax(0,1fr)]"}`}>
        <div className="hidden h-full min-h-0 lg:block"><EndpointPalette operations={operations} /></div>
        <div className="relative h-full min-h-[480px] bg-fog/40"><TestWorkflowCanvas operations={operations} store={store} /></div>
        {selectedNode ? (
          <div className="absolute inset-y-0 right-0 z-20 w-[min(340px,90vw)] shadow-xl xl:static xl:w-auto xl:shadow-none">
            <NodeInspector
              environment={environment}
              isStale={isStale}
              node={selectedNode}
              onDeleteNode={deleteNode}
              onUpdateNode={updateNode}
              testData={state.definition.context.testData}
            />
          </div>
        ) : null}
      </div>
      {isConsoleOpen ? (
        <div className="shrink-0 relative border-t border-chalk">
          <div
            className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize bg-transparent hover:bg-signal-orange/30 active:bg-signal-orange/50 transition-colors z-30"
            onMouseDown={handleMouseDown}
          />
          <div style={{ height: `${consoleHeight}px` }} className="w-full">
            <RunConsole
              nodes={state.definition.nodes}
              onClose={() => {
                setIsConsoleOpen(false);
                dispatch({ type: "RUN_FINISH" });
              }}
              run={state.runStatus}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
