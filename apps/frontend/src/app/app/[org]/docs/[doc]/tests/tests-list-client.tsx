"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TestWorkflowDto } from "@/entities/test-workflow";
import { createWorkflow } from "@/shared/api/test-workflows-client";

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
    <div className="test-workflow-list-page">
      <div className="test-workflow-list-header">
        <div>
          <a className="test-workflow-back-link" href={`/app/${encodeURIComponent(org)}/docs/${encodeURIComponent(doc)}`}>
            Back to document
          </a>
          <h1>Test workflows</h1>
          <p>{workflows.length} workflow{workflows.length === 1 ? "" : "s"} on branch {branch}</p>
        </div>
        <button type="button" onClick={openCreate}>
          New workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <div className="test-workflow-empty">
          <h2>No workflows yet</h2>
          <p>Create a workflow to start arranging endpoint tests on the canvas.</p>
          <button type="button" onClick={openCreate}>
            Create workflow
          </button>
        </div>
      ) : (
        <div className="test-workflow-grid">
          {workflows.map((workflow) => (
            <a key={workflow.id} className="test-workflow-card" href={workflowPath(workflow.id)}>
              <div>
                <h2>{workflow.name}</h2>
                <p>{workflow.description || "No description"}</p>
              </div>
              <dl>
                <div>
                  <dt>Nodes</dt>
                  <dd>{workflow.definitionJson.nodes.length}</dd>
                </div>
                <div>
                  <dt>Revision</dt>
                  <dd>{workflow.revision}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{new Date(workflow.updatedAt).toLocaleDateString()}</dd>
                </div>
              </dl>
            </a>
          ))}
        </div>
      )}

      {isCreateOpen ? (
        <div className="test-workflow-modal-backdrop" role="presentation">
          <form className="test-workflow-modal" onSubmit={create}>
            <div className="test-workflow-modal-header">
              <h2>Create workflow</h2>
              <button type="button" onClick={() => setIsCreateOpen(false)} aria-label="Close create workflow">
                ×
              </button>
            </div>
            <label className="test-workflow-field">
              <span>Name</span>
              <input
                autoFocus
                value={createName}
                onChange={(event) => {
                  setCreateName(event.target.value);
                  setCreateError(null);
                }}
                placeholder="Smoke test"
              />
            </label>
            {createError ? <p className="test-workflow-error">{createError}</p> : null}
            <div className="test-workflow-modal-actions">
              <button type="button" onClick={() => setIsCreateOpen(false)} disabled={creating}>
                Cancel
              </button>
              <button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
