"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  TestWorkflowDto,
  TestEnvironmentDto,
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
import { WorkflowEditorDialogs } from "@/features/test-workflow-editor/ui/workflow-editor-dialogs";
import { WorkflowEditorToolbar } from "@/features/test-workflow-editor/ui/workflow-editor-toolbar";
import { useSaveWorkflow } from "@/features/test-workflow-editor/model/use-save-workflow";
import { useRunWorkflow } from "@/features/test-workflow-editor/model/use-run-workflow";
import { WorkflowEditorWorkspace } from "./workflow-editor-workspace";

type TestsPageClientProps = {
  readonly org: string;
  readonly doc: string;
  readonly branch: string;
  readonly initialWorkflows: readonly TestWorkflowDto[];
  readonly operations: readonly PaletteOperation[];
  readonly initialWorkflowId?: string;
  readonly defaultServerUrl?: string | undefined;
};

export function TestsPageClient({
  org,
  doc,
  branch,
  initialWorkflows,
  operations,
  initialWorkflowId,
  defaultServerUrl,
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
const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const testsPath = `/app/${encodeURIComponent(org)}/docs/${encodeURIComponent(doc)}/tests`;
  const workflowPath = useCallback((workflowId: string) => `${testsPath}/${encodeURIComponent(workflowId)}`, [testsPath]);

  // Editor store
  const store = useWorkflowEditorStore();
  const { state, dispatch } = store;
  const saveWorkflowFn = useSaveWorkflow(org, doc, branch, store);
  const { run: runWorkflowFn, stopPolling: cancelPollingFn } = useRunWorkflow(org, doc, branch, store, saveWorkflowFn);

  // Load environment variables on mount
  useEffect(() => {
    console.log("Loading environments for branch:", branch);
    listEnvironments({ orgSlug: org, docSlug: doc, branchSlug: branch })
      .then((envs) => {
        console.log("Loaded environments from backend:", envs);
        setEnvironments(envs);
        const def = envs.find((e) => e.isDefault) || envs[0];
        console.log("Default env selected:", def);
        if (def) {
          console.log("Setting selectedEnvId to:", def.id);
          setSelectedEnvId(def.id);
        }
      })
      .catch((err) => console.error("Failed to load environments:", err));
  }, [org, doc, branch]);

  // Load current workflow definition
  useEffect(() => {
    const current = workflows.find((workflow) => workflow.id === initialWorkflowId) || workflows[0];
    if (!current) {
      return;
    }
    if (state.workflowId === current.id) {
      return;
    }

    dispatch({ type: "LOAD_WORKFLOW", workflow: current, defaultServerUrl });
    if (!initialWorkflowId) {
      router.replace(workflowPath(current.id));
    }
  }, [initialWorkflowId, workflows, state.workflowId, dispatch, router, workflowPath, defaultServerUrl]);

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
      const nextWorkflow = remaining[0];
      if (nextWorkflow !== undefined) {
        router.push(workflowPath(nextWorkflow.id));
      } else {
        router.push(testsPath);
      }
    } catch (err) {
      alert(`Failed to delete workflow: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRun = () => {
    runWorkflowFn(selectedEnvId);
    setIsConsoleOpen(true);
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

  // Sync state back to workflows list on successful save
  useEffect(() => {
    if (state.lastSavedAt && state.workflowId) {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === state.workflowId
            ? {
                ...w,
                name: state.name,
                description: state.description,
                tags: state.metadata.tags,
                priority: state.metadata.priority,
                type: state.metadata.type,
                revision: state.revision,
                definitionJson: state.definition,
              }
            : w,
        ),
      );
    }
  }, [state.lastSavedAt, state, state.workflowId]);

  const selectedEnvironment = environments.find((environment) => environment.id === selectedEnvId) ?? null;

  // Stale check across all nodes to disable Run button
  const hasStaleNodes = state.definition.nodes.some(
    (n) => !operations.some((op) => op.operationId === n.operationId),
  );

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-paper text-carbon select-none">
      <WorkflowEditorToolbar
        doc={doc}
        environments={environments}
        hasStaleNodes={hasStaleNodes}
        onCancel={handleCancel}
        onDelete={handleDeleteWorkflow}
        onOpenCreate={handleOpenCreateWorkflow}
        onOpenEnvironments={() => setIsEnvModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRun={handleRun}
        onSave={saveWorkflowFn}
        onSelectEnvironment={setSelectedEnvId}
        onSelectWorkflow={handleSelectWorkflow}
        org={org}
        selectedEnvironmentId={selectedEnvId}
        state={state}
        workflows={workflows}
        isConsoleOpen={isConsoleOpen}
        onToggleConsole={() => setIsConsoleOpen((prev) => !prev)}
      />

      <WorkflowEditorWorkspace
        environment={selectedEnvironment}
        operations={operations}
        store={store}
        isConsoleOpen={isConsoleOpen}
        setIsConsoleOpen={setIsConsoleOpen}
      />

      <WorkflowEditorDialogs
        branch={branch}
        createError={createError}
        createName={createName}
        createOpen={isCreateOpen}
        creating={creating}
        doc={doc}
        environments={environments}
        environmentsOpen={isEnvModalOpen}
        onCloseCreate={() => setIsCreateOpen(false)}
        onCloseEnvironments={() => setIsEnvModalOpen(false)}
        onCloseSettings={() => setIsSettingsOpen(false)}
        onCreateNameChange={(name) => { setCreateName(name); setCreateError(null); }}
        onCreateSubmit={handleCreateWorkflow}
        onEnvironmentsChanged={(updated) => {
          setEnvironments(updated);
          const selected = updated.find((environment) => environment.isDefault) ?? updated[0];
          setSelectedEnvId(selected?.id ?? null);
        }}
        onOpenEnvironments={() => { setIsSettingsOpen(false); setIsEnvModalOpen(true); }}
        org={org}
        settingsOpen={isSettingsOpen}
        store={store}
      />
    </div>
  );
}
