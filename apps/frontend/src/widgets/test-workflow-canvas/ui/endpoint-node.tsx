"use client";

import { Handle, Position } from "@xyflow/react";
import type { TestWorkflowNodePhase, TestWorkflowStepStatus } from "@/entities/test-workflow";
import { getPhaseBadgeClass } from "@/features/test-workflow-editor/model/workflow-phases";

type EndpointNodeData = {
  readonly label: string;
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly phase: TestWorkflowNodePhase;
  readonly status?: TestWorkflowStepStatus;
  readonly isStale?: boolean;
  readonly isSelected?: boolean;
};

export function EndpointNode({ data }: { readonly data: EndpointNodeData }) {
  const methodColor = getMethodColorClass(data.method);
  const statusColor = getStatusColorClass(data.status, data.isStale);

  return (
    <div className={`rounded-lg border shadow-sm bg-white min-w-[200px] max-w-[280px] text-xs relative ${
      data.isSelected ? "ring-2 ring-signal-orange border-signal-orange" : "border-chalk"
    }`}>
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2.5 h-2.5 bg-slate-400 border border-white rounded-full focus:bg-signal-orange"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2.5 h-2.5 bg-slate-400 border border-white rounded-full focus:bg-signal-orange"
      />

      {/* Header */}
      <div className="flex items-center gap-1.5 p-2 border-b border-chalk bg-fog rounded-t-lg">
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded font-mono ${methodColor}`}>
          {data.method}
        </span>
        <span className="font-semibold text-carbon truncate flex-1">{data.label}</span>
        <span className={`rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide ${getPhaseBadgeClass(data.phase)}`}>
          {data.phase}
        </span>
        {data.isStale && (
          <span className="text-[8px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-1 rounded">
            STALE
          </span>
        )}
      </div>

      {/* Path */}
      <div className="p-2 font-mono text-[10px] text-slate truncate">
        {data.path}
      </div>

      {/* Status Footer */}
      {data.status && (
        <div className="border-t border-chalk px-2 py-1 flex items-center justify-between text-[10px] rounded-b-lg">
          <span className="text-slate">status:</span>
          <span className={`font-semibold capitalize ${statusColor}`}>{data.status}</span>
        </div>
      )}
    </div>
  );
}

function getMethodColorClass(method: string): string {
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

function getStatusColorClass(status?: string, isStale?: boolean): string {
  if (isStale) return "text-amber-600";
  switch (status) {
    case "succeeded":
      return "text-green-600";
    case "failed":
      return "text-red-600";
    case "running":
      return "text-signal-orange";
    case "skipped":
      return "text-slate";
    case "canceled":
      return "text-gray-500";
    default:
      return "text-slate";
  }
}
