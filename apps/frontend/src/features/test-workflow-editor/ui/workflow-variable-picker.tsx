import type { JsonValue, TestEnvironmentDto } from "@/entities/test-workflow";

type WorkflowVariablePickerProps = {
  readonly environment: TestEnvironmentDto | null;
  readonly testData: Readonly<Record<string, JsonValue>>;
  readonly value: string;
  readonly fieldLabel: string;
  readonly onSelect: (value: string) => void;
};

const environmentVariableTemplate = (key: string): string => `{{env.${key}}}`;
const dataVariableTemplate = (key: string): string => `{{data.${key}}}`;

export function WorkflowVariablePicker(props: WorkflowVariablePickerProps) {
  const environmentTemplates = props.environment?.variables.map((variable) => environmentVariableTemplate(variable.key)) ?? [];
  const dataKeys = Object.keys(props.testData);
  if (environmentTemplates.length === 0 && dataKeys.length === 0) {
    return null;
  }
  const templates = [...environmentTemplates, ...dataKeys.map(dataVariableTemplate)];
  return (
    <select
      aria-label={`Use a workflow variable for ${props.fieldLabel}`}
      className="h-10 w-full min-w-0 max-w-40 flex-1 rounded-lg border border-chalk bg-fog px-2 py-2 font-mono text-xs text-carbon focus:border-signal-orange focus:outline-none"
      onChange={(event) => { if (event.target.value) props.onSelect(event.target.value); }}
      value={templates.includes(props.value) ? props.value : ""}
    >
      <option value="">Insert variable...</option>
      {props.environment && props.environment.variables.length > 0 ? (
        <optgroup label="Environment variables">
          {props.environment.variables.map((variable) => (
            <option key={variable.id} value={environmentVariableTemplate(variable.key)}>{variable.key}</option>
          ))}
        </optgroup>
      ) : null}
      {dataKeys.length > 0 ? (
        <optgroup label="Test data">
          {dataKeys.map((key) => <option key={key} value={dataVariableTemplate(key)}>{key}</option>)}
        </optgroup>
      ) : null}
    </select>
  );
}
