"use client";

import type { ConsoleField } from "../model/types";

type KeyValueEditorProps = {
  readonly title: string;
  readonly fields: readonly ConsoleField[];
  readonly onChange: (updated: readonly ConsoleField[]) => void;
  readonly onAdd?: (() => void) | undefined;
  readonly addLabel?: string | undefined;
  readonly emptyLabel?: string | undefined;
  readonly errorPrefix?: string | undefined;
  readonly validationErrors?: Record<string, string> | undefined;
  readonly autofocusRef?: ((el: HTMLInputElement | null) => void) | undefined;
  readonly renderVariablePicker?: ((value: string, onSelect: (value: string) => void, label: string) => React.ReactNode) | undefined;
  readonly hideCheckboxes?: boolean | undefined;
  readonly forceEditableKeys?: boolean | undefined;
};

export function KeyValueEditor({
  title,
  fields,
  onChange,
  onAdd,
  addLabel = "+ Add parameter",
  emptyLabel = "No items configured",
  errorPrefix,
  validationErrors = {},
  autofocusRef,
  renderVariablePicker,
  hideCheckboxes = false,
  forceEditableKeys = false,
}: KeyValueEditorProps) {
  const handleFieldChange = (index: number, updates: Partial<ConsoleField>) => {
    const next = [...fields];
    const old = next[index];
    if (old) {
      next[index] = { ...old, ...updates };
      onChange(next);
    }
  };

  const handleFieldDelete = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate">{title}</h4>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="text-xs text-signal-orange font-semibold hover:text-signal-orange/80 transition-colors cursor-pointer"
          >
            {addLabel}
          </button>
        )}
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-slate italic">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-chalk text-left text-[11px] font-semibold text-slate">
                {!hideCheckboxes && <th className="py-2 px-1 w-8 text-center">Use</th>}
                <th className="py-2 px-2 w-1/3">Key</th>
                <th className="py-2 px-2">Value</th>
                <th className="py-2 px-1 w-8 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const errorKey = errorPrefix ? `${errorPrefix}-${field.key}` : "";
                const hasError = errorKey ? Boolean(validationErrors[errorKey]) : false;
                const isKeyEditable = forceEditableKeys || field.isCustom;

                return (
                  <tr key={field.id} className="border-b border-chalk last:border-b-0 hover:bg-fog/50">
                    {!hideCheckboxes && (
                      <td className="py-2 px-1 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={field.enabled}
                          onChange={(e) => handleFieldChange(index, { enabled: e.target.checked })}
                          className="rounded border-chalk text-signal-orange focus:ring-signal-orange accent-signal-orange cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="py-2 px-2 align-middle">
                      <input
                        type="text"
                        value={field.key}
                        readOnly={!isKeyEditable}
                        disabled={!hideCheckboxes && !field.enabled}
                        onChange={(e) => handleFieldChange(index, { key: e.target.value })}
                        placeholder="Key"
                        className={`w-full rounded border px-2 py-1 font-mono text-xs transition-all ${
                          isKeyEditable
                            ? "border-chalk hover:border-signal-orange/60 focus:border-signal-orange focus:bg-white focus:outline-none"
                            : "border-transparent bg-transparent text-graphite font-semibold focus:outline-none"
                        }`}
                      />
                    </td>
                    <td className="py-2 px-2 align-middle">
                      <div className="flex flex-col gap-1 w-full">
                        <input
                          type="text"
                          value={field.value}
                          disabled={!hideCheckboxes && !field.enabled}
                          onChange={(e) => handleFieldChange(index, { value: e.target.value })}
                          placeholder={field.required ? "required" : "optional"}
                          className={`w-full rounded border px-2 py-1 font-mono text-xs transition-all ${
                            hasError
                              ? "border-red-500 bg-red-50/20 focus:outline-none"
                              : "border-chalk bg-fog/60 hover:border-signal-orange/60 focus:border-signal-orange focus:bg-white focus:outline-none"
                          }`}
                          ref={index === 0 ? autofocusRef : undefined}
                        />
                        {renderVariablePicker && (hideCheckboxes || field.enabled) && (
                          <div className="w-full select-none">
                            {renderVariablePicker(
                              field.value,
                              (selected) => handleFieldChange(index, { value: selected }),
                              `${title} value`
                            )}
                          </div>
                        )}
                      </div>
                      {hasError && (
                        <p className="text-[9px] text-red-500 mt-0.5">{validationErrors[errorKey]}</p>
                      )}
                    </td>
                    <td className="py-2 px-1 text-center align-middle">
                      {(forceEditableKeys || field.isCustom) && (
                        <button
                          type="button"
                          onClick={() => handleFieldDelete(index)}
                          className="text-slate hover:text-red-500 font-semibold text-xs cursor-pointer font-sans"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
