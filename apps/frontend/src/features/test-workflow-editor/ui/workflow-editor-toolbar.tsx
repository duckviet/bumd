import type { TestEnvironmentDto, TestWorkflowDto } from "@/entities/test-workflow";
import type { TestWorkflowEditorState } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import { RunButton } from "@/features/test-workflow-run/ui/run-button";
import { DashboardButton } from "@/shared/ui/dashboard-primitives";

type WorkflowEditorToolbarProps = {
  readonly org: string;
  readonly doc: string;
  readonly workflows: readonly TestWorkflowDto[];
  readonly environments: readonly TestEnvironmentDto[];
  readonly selectedEnvironmentId: string | null;
  readonly state: TestWorkflowEditorState;
  readonly hasStaleNodes: boolean;
  readonly onSelectWorkflow: (workflowId: string) => void;
  readonly onSelectEnvironment: (environmentId: string | null) => void;
  readonly onOpenCreate: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenEnvironments: () => void;
  readonly onDelete: () => void;
  readonly onSave: () => void;
  readonly onRun: () => void;
  readonly onCancel: () => void;
};

export function WorkflowEditorToolbar(props: WorkflowEditorToolbarProps) {
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-chalk bg-paper px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <a className="flex items-center gap-1 text-xs font-semibold text-slate hover:text-carbon" href={`/app/${props.org}/docs/${props.doc}`}>
          &larr; Back to Portal Overview
        </a>
        <div className="h-4 w-px bg-chalk" />
        {props.state.workflowId ? (
          <DashboardButton className="h-8 px-3 text-xs" onClick={props.onOpenSettings} tone="secondary">Settings</DashboardButton>
        ) : null}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-carbon" htmlFor="workflow-selector">Workflow:</label>
          <select
            className="max-w-[200px] rounded border border-chalk bg-paper px-2 py-1 text-xs focus:border-signal-orange focus:outline-none"
            id="workflow-selector"
            onChange={(event) => props.onSelectWorkflow(event.target.value)}
            value={props.state.workflowId ?? ""}
          >
            {props.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
          </select>
          <button className="cursor-pointer text-xs font-bold text-signal-orange hover:underline" onClick={props.onOpenCreate} type="button">+ New</button>
          {props.state.workflowId ? (
            <button className="cursor-pointer text-xs font-bold text-red-500 hover:underline" onClick={props.onDelete} type="button">Delete</button>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-medium">
          <label className="text-xs font-semibold text-slate" htmlFor="environment-selector">Env:</label>
          <select
            className="rounded border border-chalk bg-paper px-2 py-1 text-xs focus:border-signal-orange focus:outline-none"
            id="environment-selector"
            onChange={(event) => props.onSelectEnvironment(event.target.value || null)}
            value={props.selectedEnvironmentId ?? ""}
          >
            <option value="">No Environment</option>
            {props.environments.map((environment) => (
              <option key={environment.id} value={environment.id}>{environment.name} {environment.isDefault ? "(default)" : ""}</option>
            ))}
          </select>
          <button
            aria-label="Configure environments"
            className="ml-1 rounded p-1 text-slate hover:bg-chalk hover:text-carbon"
            onClick={props.onOpenEnvironments}
            type="button"
          >
            <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M12 15.75A3.75 3.75 0 1 0 12 8.25a3.75 3.75 0 0 0 0 7.5Z" />
              <path d="M19.5 12a7.5 7.5 0 0 0-.1-1.22l1.45-1.13-1.5-2.6-1.7.68a7.5 7.5 0 0 0-2.1-1.22L15.3 4.7h-3l-.27 1.81a7.5 7.5 0 0 0-2.1 1.22l-1.7-.68-1.5 2.6 1.45 1.13a7.5 7.5 0 0 0 0 2.44l-1.45 1.13 1.5 2.6 1.7-.68a7.5 7.5 0 0 0 2.1 1.22l.27 1.81h3l.27-1.81a7.5 7.5 0 0 0 2.1-1.22l1.7.68 1.5-2.6-1.45-1.13c.07-.4.1-.81.1-1.22Z" />
            </svg>
          </button>
        </div>
        <div className="h-4 w-px bg-chalk" />
        {props.state.dirty ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">Unsaved Changes</span> : null}
        {props.state.lastSavedAt && !props.state.dirty ? <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600">Saved at {props.state.lastSavedAt}</span> : null}
        {props.state.workflowId ? (
          <button
            className="cursor-pointer rounded-full border border-carbon bg-paper px-3 py-1.5 text-xs font-semibold text-carbon hover:bg-fog disabled:cursor-default disabled:border-chalk disabled:text-slate"
            disabled={props.state.saving || !props.state.dirty}
            onClick={props.onSave}
            type="button"
          >
            {props.state.saving ? "Saving..." : "Save"}
          </button>
        ) : null}
        {props.state.workflowId ? <RunButton hasStaleNodes={props.hasStaleNodes} onCancel={props.onCancel} onRun={props.onRun} running={props.state.running} /> : null}
      </div>
    </header>
  );
}
