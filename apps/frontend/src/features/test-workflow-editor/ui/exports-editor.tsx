"use client";

import type { TestWorkflowNode, TestWorkflowExport } from "@/entities/test-workflow";

type ExportsEditorProps = {
  readonly node: TestWorkflowNode;
  readonly onChange: (exports: readonly TestWorkflowExport[]) => void;
};

export function ExportsEditor({ node, onChange }: ExportsEditorProps) {
  const exports = node.exports || [];

  const handleAddExport = () => {
    const updated = [...exports, { name: "variable_name", source: "body" as const, path: "$.id" }];
    onChange(updated);
  };

  const handleRemoveExport = (index: number) => {
    onChange(exports.filter((_, idx) => idx !== index));
  };

  const handleFieldChange = (index: number, field: keyof TestWorkflowExport, value: string) => {
    const updated = exports.map((item, idx) => {
      if (idx !== index) return item;
      const updatedItem = { ...item, [field]: value };
      // Clean up fields based on source
      if (field === "source") {
        if (value === "status") {
          delete updatedItem.headerName;
          delete updatedItem.path;
        } else if (value === "header") {
          updatedItem.headerName = updatedItem.headerName || "Content-Type";
          delete updatedItem.path;
        } else {
          updatedItem.path = updatedItem.path || "$.id";
          delete updatedItem.headerName;
        }
      }
      return updatedItem;
    });
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex items-center justify-between">
        <label className="font-semibold text-carbon">Response Variable Exports</label>
        <button
          type="button"
          onClick={handleAddExport}
          className="text-[10px] font-bold text-signal-orange hover:opacity-80 cursor-pointer"
        >
          + Add Export
        </button>
      </div>

      {exports.length === 0 ? (
        <span className="text-slate italic text-[11px]">No variable exports configured. Drag and connect downstream nodes to reference these.</span>
      ) : (
        <div className="flex flex-col gap-3">
          {exports.map((exp, index) => (
            <div key={index} className="flex flex-col gap-2 rounded border border-chalk bg-fog p-2 relative">
              <button
                type="button"
                onClick={() => handleRemoveExport(index)}
                className="absolute top-1 right-2 text-slate hover:text-red-500 font-bold text-sm cursor-pointer"
              >
                &times;
              </button>

              {/* Name */}
              <div className="flex flex-col gap-0.5 w-11/12">
                <span className="text-[10px] text-slate font-medium">Export Name (Reference as vars.name)</span>
                <input
                  type="text"
                  value={exp.name}
                  onChange={(e) => handleFieldChange(index, "name", e.target.value)}
                  className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                  placeholder="user_id"
                />
              </div>

              {/* Source */}
              <div className="flex gap-2">
                <div className="flex flex-col gap-0.5 w-1/2">
                  <span className="text-[10px] text-slate font-medium">Source</span>
                  <select
                    value={exp.source}
                    onChange={(e) => handleFieldChange(index, "source", e.target.value)}
                    className="rounded border border-chalk bg-white px-1 py-1 focus:border-signal-orange focus:outline-none text-[11px]"
                  >
                    <option value="body">Body (JSON path)</option>
                    <option value="header">Header</option>
                    <option value="status">HTTP Status</option>
                  </select>
                </div>

                {/* Path / HeaderName conditionally */}
                {exp.source === "body" && (
                  <div className="flex flex-col gap-0.5 w-1/2">
                    <span className="text-[10px] text-slate font-medium">JSON Path</span>
                    <input
                      type="text"
                      value={exp.path ?? ""}
                      onChange={(e) => handleFieldChange(index, "path", e.target.value)}
                      className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                      placeholder="$.id"
                    />
                  </div>
                )}

                {exp.source === "header" && (
                  <div className="flex flex-col gap-0.5 w-1/2">
                    <span className="text-[10px] text-slate font-medium">Header Name</span>
                    <input
                      type="text"
                      value={exp.headerName ?? ""}
                      onChange={(e) => handleFieldChange(index, "headerName", e.target.value)}
                      className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                      placeholder="X-Request-Id"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
