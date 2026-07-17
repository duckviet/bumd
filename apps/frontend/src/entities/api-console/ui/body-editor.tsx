"use client";

import type { ConsoleField, MultipartField } from "../model/types";
import { KeyValueEditor } from "./key-value-editor";

type BodyEditorProps = {
  readonly bodyType: "json" | "key-value" | "multipart";
  readonly onBodyTypeChange: (type: "json" | "key-value" | "multipart") => void;
  readonly bodyText: string;
  readonly onBodyTextChange: (text: string) => void;
  readonly keyValueFields: readonly ConsoleField[];
  readonly onKeyValueFieldsChange: (fields: readonly ConsoleField[]) => void;
  readonly multipartFields: readonly MultipartField[];
  readonly onMultipartFieldsChange: (fields: readonly MultipartField[]) => void;
  readonly validationErrors?: Record<string, string> | undefined;
  readonly autofocusRef?: ((el: HTMLTextAreaElement | null) => void) | undefined;
  readonly renderVariablePicker?: ((value: string, onSelect: (value: string) => void, label: string) => React.ReactNode) | undefined;
  readonly required?: boolean | undefined;
  readonly contentTypeLabel?: string | undefined;
  readonly hideCheckboxes?: boolean | undefined;
};

export function BodyEditor({
  bodyType,
  onBodyTypeChange,
  bodyText,
  onBodyTextChange,
  keyValueFields,
  onKeyValueFieldsChange,
  multipartFields,
  onMultipartFieldsChange,
  validationErrors = {},
  autofocusRef,
  renderVariablePicker,
  required = false,
  contentTypeLabel,
  hideCheckboxes = false,
}: BodyEditorProps) {
  const handleFieldChange = (index: number, updates: Partial<MultipartField>) => {
    const next = [...multipartFields];
    const old = next[index];
    if (old) {
      next[index] = { ...old, ...updates };
      onMultipartFieldsChange(next);
    }
  };

  const handleFieldDelete = (index: number) => {
    onMultipartFieldsChange(multipartFields.filter((_, i) => i !== index));
  };

  const handleAddField = () => {
    onMultipartFieldsChange([
      ...multipartFields,
      {
        id: `multipart-${Date.now()}-${Math.random()}`,
        key: "",
        value: "",
        type: "text",
        enabled: true,
        isCustom: true,
      },
    ]);
  };

  const handleCustomAddKeyValue = () => {
    onKeyValueFieldsChange([
      ...keyValueFields,
      {
        id: `body-kv-${Date.now()}-${Math.random()}`,
        key: "",
        value: "",
        enabled: true,
        isCustom: true,
      },
    ]);
  };

  const handleFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        handleFieldChange(index, {
          value: text,
          fileName: file.name,
          contentType: file.type || "text/plain",
        });
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-[340px] gap-3">
      <div className="flex items-center justify-between border-b border-chalk pb-2">
        <div className="flex gap-2">
          {(["json", "key-value", "multipart"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onBodyTypeChange(type)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                bodyType === type
                  ? "border-signal-orange bg-signal-orange text-white"
                  : "border-chalk bg-fog text-slate hover:text-carbon hover:bg-chalk"
              }`}
            >
              {type === "json" ? "JSON Raw" : type === "key-value" ? "JSON Key-Value" : "Multipart Form"}
            </button>
          ))}
        </div>
        {contentTypeLabel && (
          <span className="text-[10px] bg-fog text-graphite border border-chalk px-2 py-0.5 rounded font-mono">
            {contentTypeLabel}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {bodyType === "json" ? (
          <div className="h-full flex flex-col relative">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-semibold text-slate uppercase tracking-wider">
                JSON Payload {required && <span className="text-red-500">*</span>}
              </span>
              {renderVariablePicker && (
                <div className="shrink-0 select-none">
                  {renderVariablePicker(
                    bodyText,
                    (selected) => onBodyTextChange(selected),
                    "request body"
                  )}
                </div>
              )}
            </div>
            <textarea
              className={`flex-1 w-full min-h-[240px] resize-none rounded-lg border p-4 font-mono text-xs leading-5 transition-all focus:outline-none focus:ring-1 ${
                validationErrors["body"]
                  ? "border-red-500 bg-red-50/10 focus:ring-red-500 focus:border-red-500"
                  : "border-chalk bg-fog focus:border-signal-orange focus:ring-signal-orange text-carbon"
              }`}
              value={bodyText}
              onChange={(e) => onBodyTextChange(e.target.value)}
              placeholder="{\n  \n}"
              ref={autofocusRef}
            />
            {validationErrors["body"] && (
              <p className="mt-1 text-xs text-red-500 font-medium">{validationErrors["body"]}</p>
            )}
          </div>
        ) : bodyType === "key-value" ? (
          <div className="h-full">
            <KeyValueEditor
              title="JSON Key-Value Fields"
              fields={keyValueFields}
              onChange={onKeyValueFieldsChange}
              onAdd={handleCustomAddKeyValue}
              addLabel="+ Add field"
              emptyLabel="No key-value fields configured."
              hideCheckboxes={hideCheckboxes}
              forceEditableKeys={true}
              renderVariablePicker={renderVariablePicker}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-semibold text-slate uppercase tracking-wider">
                Multipart Fields
              </span>
              <button
                type="button"
                onClick={handleAddField}
                className="text-xs text-signal-orange font-semibold hover:underline cursor-pointer"
              >
                + Add Field
              </button>
            </div>

            {multipartFields.length === 0 ? (
              <p className="text-xs text-slate italic py-4">No fields configured. Click "+ Add Field" to add a new form parameter.</p>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[360px] pr-1 flex-1">
                {multipartFields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start border-b border-chalk/45 pb-2 last:border-b-0">
                    {!hideCheckboxes && (
                      <input
                        type="checkbox"
                        checked={field.enabled}
                        onChange={(e) => handleFieldChange(index, { enabled: e.target.checked })}
                        className="rounded border-chalk text-signal-orange focus:ring-signal-orange accent-signal-orange cursor-pointer mt-2"
                      />
                    )}
                    <input
                      type="text"
                      value={field.key}
                      onChange={(e) => handleFieldChange(index, { key: e.target.value })}
                      placeholder="Key"
                      className="w-1/3 rounded border border-chalk px-2 py-1 font-mono text-xs focus:border-signal-orange focus:outline-none"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => handleFieldChange(index, { type: e.target.value as "text" | "file", value: "", fileName: undefined, contentType: undefined })}
                      className="rounded border border-chalk px-1 py-1 text-xs focus:border-signal-orange focus:outline-none"
                    >
                      <option value="text">Text</option>
                      <option value="file">File</option>
                    </select>

                    <div className="flex-1 min-w-0">
                      {field.type === "text" ? (
                        <div className="flex gap-1 items-center">
                          <input
                            type="text"
                            value={field.value}
                            disabled={!hideCheckboxes && !field.enabled}
                            onChange={(e) => handleFieldChange(index, { value: e.target.value })}
                            placeholder="Value"
                            className="flex-1 min-w-0 rounded border border-chalk px-2 py-1 font-mono text-xs focus:border-signal-orange focus:outline-none"
                          />
                          {renderVariablePicker && (hideCheckboxes || field.enabled) && (
                            <div className="shrink-0 select-none">
                              {renderVariablePicker(
                                field.value,
                                (selected) => handleFieldChange(index, { value: selected }),
                                `Multipart field ${field.key}`
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-2 items-center">
                            <input
                              type="file"
                              id={`file-input-${field.id}`}
                              className="hidden"
                              onChange={(e) => handleFileChange(index, e)}
                            />
                            <label
                              htmlFor={`file-input-${field.id}`}
                              className="cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-chalk bg-fog px-3 py-1.5 text-xs font-semibold hover:border-carbon hover:text-carbon transition-colors"
                            >
                              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                              </svg>
                              Upload File
                            </label>
                            {field.fileName && (
                              <span className="text-[10px] text-emerald-600 font-semibold truncate max-w-[120px]" title={field.fileName}>
                                ✓ {field.fileName}
                              </span>
                            )}
                          </div>
                          {field.value && (
                            <div className="text-[9px] font-mono text-slate bg-fog px-2 py-1 rounded max-h-[60px] overflow-y-auto whitespace-pre truncate">
                              {field.value.slice(0, 100)}{field.value.length > 100 ? "..." : ""}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleFieldDelete(index)}
                      className="text-slate hover:text-red-500 font-bold px-1.5 cursor-pointer mt-1"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
