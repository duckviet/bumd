"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TestWorkflowDto } from "@/entities/test-workflow";
import { createWorkflow } from "@/shared/api/test-workflows-client";
import {
  DashboardButton,
  DashboardModal,
  fieldClassName,
  FormField,
  ModalActions,
  ModalHeader,
} from "@/shared/ui/dashboard-primitives";

type TestsListClientProps = {
  readonly org: string;
  readonly doc: string;
  readonly branch: string;
  readonly initialWorkflows: readonly TestWorkflowDto[];
};

export function TestsListClient({ org, doc, branch, initialWorkflows }: TestsListClientProps): React.ReactElement {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<TestWorkflowDto[]>(() => [...initialWorkflows]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const testsPath = `/app/${encodeURIComponent(org)}/docs/${encodeURIComponent(doc)}/tests`;
  const workflowPath = (workflowId: string) => `${testsPath}/${encodeURIComponent(workflowId)}`;

  const openCreate = () => {
    setCreateName("");
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = createName.trim();
    if (!name) {
      setCreateError("Workflow name is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const workflow = await createWorkflow({
        orgSlug: org,
        docSlug: doc,
        branchSlug: branch,
        body: { name },
      });
      setWorkflows((current) => [workflow, ...current]);
      setIsCreateOpen(false);
      router.push(workflowPath(workflow.id));
    } catch (error) {
      setCreateError(`Failed to create workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col items-start justify-between gap-4 rounded-lg border border-chalk bg-paper p-6 sm:flex-row">
        <div>
          <a className="text-sm font-semibold text-sienna-bronze hover:text-carbon" href={`/app/${encodeURIComponent(org)}/docs/${encodeURIComponent(doc)}`}>
            Back to document
          </a>
          <h1 className="mt-2 text-3xl font-semibold text-carbon">Test workflows</h1>
          <p className="mt-1 text-sm text-graphite">{workflows.length} workflow{workflows.length === 1 ? "" : "s"} on branch {branch}</p>
        </div>
        <DashboardButton onClick={openCreate}>New workflow</DashboardButton>
      </header>

      {workflows.length === 0 ? (
        <div className="grid justify-items-start gap-2 rounded-lg border border-dashed border-slate bg-paper p-7">
          <h2 className="text-xl font-semibold">No workflows yet</h2>
          <p className="text-sm text-graphite">Create a workflow to start arranging endpoint tests on the canvas.</p>
          <DashboardButton className="mt-2" onClick={openCreate}>Create workflow</DashboardButton>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {workflows.map((workflow) => (
            <a key={workflow.id} className="grid min-h-48 gap-5 rounded-lg border border-chalk bg-paper p-5 transition-[border-color,background-color] duration-200 hover:border-slate hover:bg-fog" href={workflowPath(workflow.id)}>
              <div>
                <h2 className="text-lg font-semibold">{workflow.name}</h2>
                <p className="mt-1 text-sm text-graphite">{workflow.description || "No description"}</p>
              </div>
              <dl className="grid grid-cols-3 gap-3 self-end">
                <div>
                  <dt className="text-xs uppercase text-slate">Nodes</dt>
                  <dd className="mt-1 text-sm font-semibold">{workflow.definitionJson.nodes.length}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate">Revision</dt>
                  <dd className="mt-1 text-sm font-semibold">{workflow.revision}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate">Updated</dt>
                  <dd className="mt-1 text-sm font-semibold">{new Date(workflow.updatedAt).toLocaleDateString()}</dd>
                </div>
              </dl>
            </a>
          ))}
        </div>
      )}

      {isCreateOpen ? (
        <DashboardModal onSubmit={create}>
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
    </div>
  );
}
