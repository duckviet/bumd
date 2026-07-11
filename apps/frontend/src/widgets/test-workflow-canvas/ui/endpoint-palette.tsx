"use client";

import { useState } from "react";

export type PaletteOperation = {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly description: string;
};

type EndpointPaletteProps = {
  readonly operations: readonly PaletteOperation[];
};

export function EndpointPalette({ operations }: EndpointPaletteProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string>("ALL");

  const onDragStart = (event: React.DragEvent, op: PaletteOperation) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(op));
    event.dataTransfer.effectAllowed = "move";
  };

  const filtered = operations.filter((op) => {
    const matchesSearch =
      op.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.operationId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesMethod = selectedMethod === "ALL" || op.method.toUpperCase() === selectedMethod;
    return matchesSearch && matchesMethod;
  });

  // Group by tag (first tag or "default")
  const groups: Record<string, PaletteOperation[]> = {};
  for (const op of filtered) {
    const tag = op.tags[0] || "default";
    groups[tag] = groups[tag] || [];
    groups[tag].push(op);
  }

  const methods = ["ALL", "GET", "POST", "PUT", "DELETE", "PATCH"];

  return (
    <div className="flex flex-col h-full bg-fog border-r border-chalk text-xs overflow-hidden">
      <header className="p-3 border-b border-chalk flex flex-col gap-2 bg-white">
        <span className="font-semibold text-carbon">Endpoint Palette</span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search endpoints..."
          className="rounded border border-chalk bg-white px-2 py-1.5 focus:border-signal-orange focus:outline-none text-[11px]"
        />
        <div className="flex gap-1 overflow-x-auto pb-1">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSelectedMethod(m)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                selectedMethod === m
                  ? "bg-signal-orange text-white border-signal-orange"
                  : "bg-white text-carbon border-chalk hover:bg-fog"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {/* Palette list */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {Object.keys(groups).length === 0 ? (
          <span className="text-slate italic text-[11px]">No endpoints found</span>
        ) : (
          Object.entries(groups).map(([tag, ops]) => (
            <div key={tag} className="flex flex-col gap-1.5">
              <span className="font-bold text-carbon tracking-wide text-[10px] uppercase border-b border-chalk pb-1">
                {tag}
              </span>
              <div className="flex flex-col gap-1.5">
                {ops.map((op) => (
                  <div
                    key={op.operationId}
                    draggable
                    onDragStart={(e) => onDragStart(e, op)}
                    className="p-2 border border-chalk rounded-md bg-white hover:border-signal-orange/60 hover:shadow-sm cursor-grab transition-all flex flex-col gap-1"
                    title="Drag and drop onto canvas"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[8px] font-bold uppercase tracking-wider px-1 py-0.2 rounded font-mono ${getMethodBadgeClass(op.method)}`}>
                        {op.method}
                      </span>
                      <span className="font-semibold text-carbon truncate">{op.summary || op.operationId}</span>
                    </div>
                    <div className="font-mono text-[9px] text-slate truncate">{op.path}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function getMethodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-blue-50 text-blue-700 border border-blue-100";
    case "POST":
      return "bg-green-50 text-green-700 border border-green-100";
    case "PUT":
      return "bg-amber-50 text-amber-700 border border-amber-100";
    case "DELETE":
      return "bg-red-50 text-red-700 border border-red-100";
    case "PATCH":
      return "bg-purple-50 text-purple-700 border border-purple-100";
    default:
      return "bg-fog text-slate border border-chalk";
  }
}
