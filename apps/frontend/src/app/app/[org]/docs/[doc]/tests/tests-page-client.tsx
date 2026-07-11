"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  TestWorkflowDto,
  TestEnvironmentDto,
  TestWorkflowNode,
} from "@/entities/test-workflow";
import type { PaletteOperation } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";
import {
  createWorkflow,
  listWorkflows,
  listEnvironments,
  deleteWorkflow,
  cancelRun,
} from "@/shared/api/test-workflows-client";
import { useWorkflowEditorStore } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import { useSaveWorkflow } from "@/features/test-workflow-editor/model/use-save-workflow";
import { useRunWorkflow } from "@/features/test-workflow-editor/model/use-run-workflow";
import { EndpointPalette } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";
import { TestWorkflowCanvas } from "@/widgets/test-workflow-canvas/ui/test-workflow-canvas";
import { NodeInspector } from "@/features/test-workflow-editor/ui/node-inspector";
import { RunButton } from "@/features/test-workflow-run/ui/run-button";
import { RunConsole } from "@/features/test-workflow-run/ui/run-console";
import {
  DashboardButton,
  DashboardModal,
  fieldClassName,
  FormField,
  ModalActions,
  ModalHeader,
} from "@/shared/ui/dashboard-primitives";

type TestsPageClientProps = {
  readonly org: string;
  readonly doc: string;
  readonly branch: string;
  readonly initialWorkflows: readonly TestWorkflowDto[];
  readonly operations: readonly PaletteOperation[];
  readonly initialWorkflowId?: string;
};

export function TestsPageClient({
  org,
  doc,
  branch,
  initialWorkflows,
  operations,
  initialWorkflowId,
}: TestsPageClientProps) {
  const router = useRouter();

  // Workflows and environments list state
const [workflows, setWorkflows] = useState<TestWorkflowDto[]>(() => [...initialWorkflows]);
const [environments, setEnvironments] = useState<TestEnvironmentDto[]>([]);
const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
const [isCreateOpen, setIsCreateOpen] = useState(false);
const [createName, setCreateName] = useState("");
const [createError, setCreateError] = useState<string | null>(null);
const [creating, setCreating] = useState(false);
  const testsPath = `/app/${encodeURIComponent(org)}/docs/${encodeURIComponent(doc)}/tests`;
  const workflowPath = useCallback((workflowId: string) => `${testsPath}/${encodeURIComponent(workflowId)}`, [testsPath]);

  // Editor store
  const store = useWorkflowEditorStore();
  const { state, dispatch } = store;
  const saveWorkflowFn = useSaveWorkflow(org, doc, branch, store);
  const { run: runWorkflowFn, stopPolling: cancelPollingFn } = useRunWorkflow(org, doc, branch, store, saveWorkflowFn);

  // Load environment variables on mount
  useEffect(() => {
    listEnvironments({ orgSlug: org, docSlug: doc, branchSlug: branch })
      .then((envs) => {
        setEnvironments(envs);
        const def = envs.find((e) => e.isDefault) || envs[0];
        if (def) setSelectedEnvId(def.id);
      })
      .catch((err) => console.error("Failed to load environments:", err));
  }, [org, doc, branch]);

  // Load current workflow definition
  useEffect(() => {
    const current = workflows.find((workflow) => workflow.id === initialWorkflowId) || workflows[0];
    if (!current) {
      return;
    }

    dispatch({ type: "LOAD_WORKFLOW", workflow: current });
    if (!initialWorkflowId) {
      router.replace(workflowPath(current.id));
    }
  }, [initialWorkflowId, workflows, dispatch, router, workflowPath]);

  const handleOpenCreateWorkflow = () => {
    setCreateName("");
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateWorkflow = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = createName.trim();
    if (!name) {
      setCreateError("Workflow name is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createWorkflow({
        orgSlug: org,
        docSlug: doc,
        branchSlug: branch,
        body: { name },
      });
      setWorkflows((prev) => [created, ...prev]);
      dispatch({ type: "LOAD_WORKFLOW", workflow: created });
      setIsCreateOpen(false);
      setCreateName("");
      router.push(workflowPath(created.id));
    } catch (err) {
      setCreateError(`Failed to create workflow: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!state.workflowId) return;
    if (!confirm("Are you sure you want to delete this test workflow?")) return;

    try {
      await deleteWorkflow({
        orgSlug: org,
        docSlug: doc,
        branchSlug: branch,
        workflowId: state.workflowId,
      });

      const remaining = workflows.filter((w) => w.id !== state.workflowId);
      setWorkflows(remaining);
      if (remaining.length > 0) {
        router.push(workflowPath(remaining[0]!.id));
      } else {
        router.push(testsPath);
      }
    } catch (err) {
      alert(`Failed to delete workflow: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRun = () => {
    runWorkflowFn(selectedEnvId);
  };

  const handleCancel = async () => {
    if (!state.workflowId || !state.currentRunId) return;
    try {
      await cancelRun({
        orgSlug: org,
        docSlug: doc,
        branchSlug: branch,
        workflowId: state.workflowId,
        runId: state.currentRunId,
      });
      cancelPollingFn();
    } catch (err) {
      alert(`Failed to cancel run: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSelectWorkflow = (wfId: string) => {
    router.push(workflowPath(wfId));
  };

  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Partial<TestWorkflowNode>) => {
      const updatedNodes = state.definition.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n,
      );
      dispatch({ type: "SET_NODES", nodes: updatedNodes });
    },
    [state.definition.nodes, dispatch],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      dispatch({ type: "REMOVE_NODE", nodeId });
    },
    [dispatch],
  );

  // Sync state back to workflows list on successful save
  useEffect(() => {
    if (state.lastSavedAt && state.workflowId) {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === state.workflowId
            ? { ...w, revision: state.revision, definitionJson: state.definition }
            : w,
        ),
      );
    }
  }, [state.lastSavedAt, state.revision, state.definition, state.workflowId]);

  // Node selection inspector resolution
  const selectedNode = state.definition.nodes.find((n) => n.id === state.selectedNodeId);
  const isSelectedNodeStale = selectedNode
    ? !operations.some((op) => op.operationId === selectedNode.operationId)
    : false;

  // Stale check across all nodes to disable Run button
  const hasStaleNodes = state.definition.nodes.some(
    (n) => !operations.some((op) => op.operationId === n.operationId),
  );

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-hidden bg-paper text-carbon select-none">
      {/* Top Toolbar */}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-chalk bg-paper px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <a href={`/app/${org}/docs/${doc}`} className="text-slate hover:text-carbon font-semibold text-xs flex items-center gap-1">
            &larr; Back to Portal Overview
          </a>
          <div className="h-4 w-px bg-chalk" />

          {/* Workflow Selector */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-carbon text-xs">Workflow:</span>
            <select
              value={state.workflowId || ""}
              onChange={(e) => handleSelectWorkflow(e.target.value)}
              className="rounded border border-chalk bg-white px-2 py-1 text-xs focus:border-signal-orange focus:outline-none max-w-[200px]"
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleOpenCreateWorkflow}
              className="text-signal-orange text-xs font-bold hover:underline cursor-pointer"
            >
              + New
            </button>
            {state.workflowId && (
              <button
                type="button"
                onClick={handleDeleteWorkflow}
                className="text-red-500 text-xs font-bold hover:underline cursor-pointer"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Environment Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate text-xs">Env:</span>
            <select
              value={selectedEnvId || ""}
              onChange={(e) => setSelectedEnvId(e.target.value || null)}
              className="rounded border border-chalk bg-white px-2 py-1 text-xs focus:border-signal-orange focus:outline-none"
            >
              <option value="">No Environment</option>
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.isDefault ? "(default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-chalk" />

          {/* State indicators */}
          {state.dirty && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Unsaved Changes</span>}
          {state.lastSavedAt && !state.dirty && (
            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Saved at {state.lastSavedAt}</span>
          )}

          {/* Save Button */}
          {state.workflowId && (
            <button
              type="button"
              disabled={state.saving || !state.dirty}
              onClick={saveWorkflowFn}
              className={`font-semibold text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                state.saving || !state.dirty
                  ? "bg-white border-chalk text-slate cursor-default"
                  : "bg-white border-carbon text-carbon hover:bg-fog"
              }`}
            >
              {state.saving ? "Saving..." : "Save"}
            </button>
          )}

          {/* Run button */}
          {state.workflowId && (
            <RunButton
              running={state.running}
              hasStaleNodes={hasStaleNodes}
              onRun={handleRun}
              onCancel={handleCancel}
            />
          )}
        </div>
      </header>

      {/* Main workspace panels */}
      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        {/* Left: Endpoint Palette */}
        <div className="hidden h-full min-h-0 lg:block">
          <EndpointPalette operations={operations} />
        </div>

        {/* Center: Canvas */}
        <div className="relative h-full min-h-[480px] bg-fog/40">
          <TestWorkflowCanvas store={store} operations={operations} />
        </div>

        {/* Right: Inspector */}
        {selectedNode && (
          <div className="absolute inset-y-0 right-0 z-20 w-[min(340px,90vw)] shadow-xl xl:static xl:w-auto xl:shadow-none">
            <NodeInspector
              node={selectedNode}
              isStale={isSelectedNodeStale}
              onUpdateNode={handleUpdateNode}
              onDeleteNode={handleDeleteNode}
            />
          </div>
        )}
      </div>

      {/* Bottom Run Console Drawer */}
      {state.runStatus && (
        <div className="shrink-0">
          <RunConsole
            run={state.runStatus}
            nodes={state.definition.nodes}
            onClose={() => dispatch({ type: "RUN_FINISH" })}
          />
        </div>
      )}

      {isCreateOpen ? (
        <DashboardModal onSubmit={handleCreateWorkflow}>
            <ModalHeader onClose={() => setIsCreateOpen(false)}>Create workflow</ModalHeader>
            <FormField label="Name">
              <input
                autoFocus
                className={fieldClassName}
                value={createName}
                onChange={(event) => {
                  setCreateName(event.target.value);
                  setCreateError(null);
                }}
                placeholder="Smoke test"
              />
            </FormField>
            {createError ? <p className="text-sm text-red-700">{createError}</p> : null}
            <ModalActions>
              <DashboardButton disabled={creating} onClick={() => setIsCreateOpen(false)} tone="secondary">Cancel</DashboardButton>
              <DashboardButton disabled={creating} type="submit">{creating ? "Creating..." : "Create"}</DashboardButton>
            </ModalActions>
        </DashboardModal>
      ) : null}

      {/* 409 Conflict reload prompt */}
      {state.conflictRevision !== null && (
        <div className="fixed inset-0 bg-carbon/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="flex max-w-sm flex-col gap-3 rounded-lg border border-chalk bg-paper p-5 shadow-xl">
            <h3 className="font-bold text-carbon text-sm">Save Conflict (409)</h3>
            <p className="text-xs text-graphite">
              This workflow has been modified in another window. Current version: #{state.conflictRevision}.
            </p>
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-9 items-center rounded-full bg-carbon px-4 text-xs font-semibold text-paper hover:bg-graphite"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
