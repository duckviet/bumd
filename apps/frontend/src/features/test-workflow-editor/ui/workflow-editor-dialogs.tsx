import type { TestEnvironmentDto } from "@/entities/test-workflow";
import type { WorkflowEditorStore } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import { EnvironmentsModal } from "@/features/test-workflow-editor/ui/environments-modal";
import { WorkflowSettingsModal } from "@/features/test-workflow-editor/ui/workflow-settings-modal";
import { DashboardModal } from "@/shared/ui/dashboard-modal";
import { DashboardButton, fieldClassName, FormField, ModalActions, ModalHeader } from "@/shared/ui/dashboard-primitives";

type WorkflowEditorDialogsProps = {
  readonly org: string;
  readonly doc: string;
  readonly branch: string;
  readonly store: WorkflowEditorStore;
  readonly environments: readonly TestEnvironmentDto[];
  readonly createOpen: boolean;
  readonly settingsOpen: boolean;
  readonly environmentsOpen: boolean;
  readonly creating: boolean;
  readonly createName: string;
  readonly createError: string | null;
  readonly onCreateNameChange: (name: string) => void;
  readonly onCreateSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly onCloseCreate: () => void;
  readonly onCloseSettings: () => void;
  readonly onCloseEnvironments: () => void;
  readonly onOpenEnvironments: () => void;
  readonly onEnvironmentsChanged: (environments: TestEnvironmentDto[]) => void;
};

export function WorkflowEditorDialogs(props: WorkflowEditorDialogsProps) {
  const { state, dispatch } = props.store;
  return (
    <>
      {props.createOpen ? (
        <DashboardModal onClose={props.onCloseCreate} onSubmit={props.onCreateSubmit} titleId="create-workflow-title">
          <ModalHeader id="create-workflow-title" onClose={props.onCloseCreate}>Create workflow</ModalHeader>
          <FormField label="Name">
            <input autoFocus className={fieldClassName} onChange={(event) => props.onCreateNameChange(event.target.value)} placeholder="Smoke test" value={props.createName} />
          </FormField>
          {props.createError ? <p className="text-sm text-red-700" role="alert">{props.createError}</p> : null}
          <ModalActions>
            <DashboardButton disabled={props.creating} onClick={props.onCloseCreate} tone="secondary">Cancel</DashboardButton>
            <DashboardButton disabled={props.creating} type="submit">{props.creating ? "Creating..." : "Create"}</DashboardButton>
          </ModalActions>
        </DashboardModal>
      ) : null}
      {props.environmentsOpen ? (
        <EnvironmentsModal
          branch={props.branch}
          doc={props.doc}
          environments={[...props.environments]}
          onClose={props.onCloseEnvironments}
          onEnvironmentsChanged={props.onEnvironmentsChanged}
          org={props.org}
        />
      ) : null}
      {props.settingsOpen ? (
        <WorkflowSettingsModal
          dispatch={dispatch}
          onClose={props.onCloseSettings}
          onOpenEnvironments={props.onOpenEnvironments}
          state={state}
        />
      ) : null}
      {state.hasSaveConflict ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-carbon/50 backdrop-blur-sm">
          <div className="flex max-w-sm flex-col gap-3 rounded-lg border border-chalk bg-paper p-5 shadow-xl">
            <h3 className="text-sm font-bold text-carbon">Save Conflict (409)</h3>
            <p className="text-xs text-graphite">
              This workflow changed in another window.
              {state.conflictRevision === null ? " Reload to get the current version." : ` Current version: #${state.conflictRevision}.`}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <DashboardButton onClick={() => window.location.reload()}>Reload page</DashboardButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
