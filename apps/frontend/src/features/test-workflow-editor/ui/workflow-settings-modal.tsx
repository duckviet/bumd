"use client";

import { useState } from "react";
import type { TestWorkflowEditorState, WorkflowEditorAction } from "@/features/test-workflow-editor/model/use-workflow-editor-store";
import type { TestWorkflowPriority, TestWorkflowType } from "@/entities/test-workflow";
import {
  testDataToRows,
  validateWorkflowSettings,
  type TestDataRow,
  type WorkflowSettingsErrors,
} from "@/features/test-workflow-editor/model/workflow-settings";
import {
  DashboardButton,
  fieldClassName,
  FormField,
  ModalActions,
  ModalError,
  ModalHeader,
} from "@/shared/ui/dashboard-primitives";
import { DashboardModal } from "@/shared/ui/dashboard-modal";

type WorkflowSettingsModalProps = {
  readonly state: TestWorkflowEditorState;
  readonly dispatch: React.Dispatch<WorkflowEditorAction>;
  readonly onClose: () => void;
  readonly onOpenEnvironments: () => void;
};

const emptyErrors: WorkflowSettingsErrors = { rows: {} };

function parsePriority(value: string): TestWorkflowPriority {
  switch (value) {
    case "low":
    case "medium":
    case "high":
    case "critical":
      return value;
    default:
      return "medium";
  }
}

function parseWorkflowType(value: string): TestWorkflowType {
  switch (value) {
    case "smoke":
    case "integration":
    case "end_to_end":
    case "contract":
      return value;
    default:
      return "integration";
  }
}

export function WorkflowSettingsModal({ state, dispatch, onClose, onOpenEnvironments }: WorkflowSettingsModalProps) {
  const [name, setName] = useState(state.name);
  const [description, setDescription] = useState(state.description ?? "");
  const [tagsText, setTagsText] = useState(state.metadata.tags.join(", "));
  const [priority, setPriority] = useState(state.metadata.priority);
  const [workflowType, setWorkflowType] = useState(state.metadata.type);
  const [testDataRows, setTestDataRows] = useState<readonly TestDataRow[]>(
    testDataToRows(state.definition.context.testData),
  );
  const [errors, setErrors] = useState<WorkflowSettingsErrors>(emptyErrors);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateWorkflowSettings({ name, description, tagsText, priority, type: workflowType, testDataRows });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    dispatch({ type: "UPDATE_SETTINGS", settings: result.settings });
    onClose();
  };

  const updateRow = (index: number, field: keyof TestDataRow, value: string) => {
    setTestDataRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
    setErrors(emptyErrors);
  };

  return (
    <DashboardModal onClose={onClose} onSubmit={handleSubmit} titleId="workflow-settings-title">
      <ModalHeader id="workflow-settings-title" onClose={onClose}>Workflow settings</ModalHeader>
      <div className="max-h-[70dvh] overflow-y-auto px-1 pt-4">
        {state.saveError ? <ModalError>{state.saveError}</ModalError> : null}
        <FormField label="Name">
          <input
            aria-describedby={errors.name ? "workflow-name-error" : undefined}
            aria-invalid={Boolean(errors.name)}
            autoFocus
            className={fieldClassName}
            maxLength={201}
            onChange={(event) => { setName(event.target.value); setErrors(emptyErrors); }}
            value={name}
          />
          {errors.name ? <span className="mt-1 block text-xs text-red-700" id="workflow-name-error">{errors.name}</span> : null}
        </FormField>
        <FormField label="Description">
          <textarea
            aria-describedby={errors.description ? "workflow-description-error" : undefined}
            aria-invalid={Boolean(errors.description)}
            className={`${fieldClassName} min-h-20 resize-y`}
            maxLength={1001}
            onChange={(event) => { setDescription(event.target.value); setErrors(emptyErrors); }}
            value={description}
          />
          {errors.description ? <span className="mt-1 block text-xs text-red-700" id="workflow-description-error">{errors.description}</span> : null}
        </FormField>
        <FormField label="Tags (comma-separated)">
          <input
            aria-describedby={errors.tags ? "workflow-tags-error" : undefined}
            aria-invalid={Boolean(errors.tags)}
            className={fieldClassName}
            onChange={(event) => { setTagsText(event.target.value); setErrors(emptyErrors); }}
            placeholder="smoke, checkout"
            value={tagsText}
          />
          {errors.tags ? <span className="mt-1 block text-xs text-red-700" id="workflow-tags-error">{errors.tags}</span> : null}
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Priority">
            <select className={fieldClassName} onChange={(event) => setPriority(parsePriority(event.target.value))} value={priority}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </FormField>
          <FormField label="Type">
            <select className={fieldClassName} onChange={(event) => setWorkflowType(parseWorkflowType(event.target.value))} value={workflowType}>
              <option value="smoke">Smoke</option>
              <option value="integration">Integration</option>
              <option value="end_to_end">End to end</option>
              <option value="contract">Contract</option>
            </select>
          </FormField>
        </div>
        <fieldset className="rounded-lg border border-chalk bg-fog p-4">
          <legend className="px-1 text-sm font-semibold text-carbon">Non-secret test data</legend>
          <p className="mb-3 text-xs leading-5 text-graphite">
            Values are saved with this workflow and must be valid JSON. Keep credentials and other secrets in Environments.
          </p>
          <DashboardButton className="mb-4 h-8 px-3 text-xs" onClick={onOpenEnvironments} tone="secondary">
            Open Environments for secrets
          </DashboardButton>
          <div className="flex flex-col gap-3">
            {testDataRows.map((row, index) => (
              <div className="rounded-lg border border-chalk bg-paper p-3" key={index}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                  <label className="text-xs font-medium text-graphite">
                    Key
                    <input
                      aria-describedby={errors.rows[index] ? `test-data-${index}-error` : undefined}
                      aria-invalid={Boolean(errors.rows[index])}
                      className={fieldClassName}
                      onChange={(event) => updateRow(index, "key", event.target.value)}
                      placeholder="accountId"
                      value={row.key}
                    />
                  </label>
                  <label className="text-xs font-medium text-graphite">
                    JSON value
                    <input
                      aria-describedby={errors.rows[index] ? `test-data-${index}-error` : undefined}
                      aria-invalid={Boolean(errors.rows[index])}
                      className={`${fieldClassName} font-mono`}
                      onChange={(event) => updateRow(index, "value", event.target.value)}
                      placeholder="42"
                      value={row.value}
                    />
                  </label>
                  <button
                    aria-label={`Remove test data row ${index + 1}`}
                    className="grid size-9 place-items-center justify-self-end rounded-full text-slate hover:bg-fog hover:text-carbon sm:mt-7"
                    onClick={() => { setTestDataRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index)); setErrors(emptyErrors); }}
                    type="button"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                {errors.rows[index] ? <p className="mt-1 text-xs text-red-700" id={`test-data-${index}-error`} role="alert">{errors.rows[index]}</p> : null}
              </div>
            ))}
          </div>
          {errors.testData ? <p className="mt-2 text-xs text-red-700" role="alert">{errors.testData}</p> : null}
          <DashboardButton
            className="mt-3 h-8 px-3 text-xs"
            disabled={testDataRows.length >= 100}
            onClick={() => setTestDataRows((rows) => [...rows, { key: "", value: "null" }])}
            tone="secondary"
          >
            Add test data
          </DashboardButton>
        </fieldset>
      </div>
      <ModalActions>
        <DashboardButton onClick={onClose} tone="secondary">Cancel</DashboardButton>
        <DashboardButton type="submit">Apply settings</DashboardButton>
      </ModalActions>
    </DashboardModal>
  );
}
