"use client";

import { useState, useEffect } from "react";
import type {
  TestWorkflowRunDetailDto,
  TestWorkflowStepRunDto,
} from "@/entities/test-workflow";

type RunConsoleProps = {
  readonly run: TestWorkflowRunDetailDto;
  readonly nodes: readonly { readonly id: string; readonly label: string }[];
  readonly onClose: () => void;
};

export function RunConsole({ run, nodes, onClose }: RunConsoleProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"request" | "response" | "inputs" | "exports" | "assertions">("request");

  // Default select first failed or first running step
  useEffect(() => {
    if (run.steps.length > 0 && !selectedStepId) {
      const active = run.steps.find((s) => s.status === "failed") || run.steps.find((s) => s.status === "running") || run.steps[0];
      if (active) setSelectedStepId(active.id);
    }
  }, [run.steps, selectedStepId]);

  const selectedStep = run.steps.find((s) => s.id === selectedStepId);
  const nodeLabel = (nodeId: string) => nodes.find((n) => n.id === nodeId)?.label || nodeId;

  return (
    <div className="flex h-[320px] bg-white border-t border-chalk overflow-hidden text-xs">
      {/* Sidebar: Steps list */}
      <div className="w-1/4 border-r border-chalk flex flex-col h-full bg-fog">
        <header className="border-b border-chalk p-3 flex justify-between items-center bg-white">
          <span className="font-semibold text-carbon">Steps Timeline</span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate hover:text-carbon font-bold text-sm cursor-pointer"
          >
            &times;
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {run.steps.length === 0 ? (
            <span className="p-3 text-slate italic block">No steps executed</span>
          ) : (
            run.steps.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStepId(s.id)}
                className={`w-full text-left p-2.5 border-b border-chalk flex items-center justify-between transition-all cursor-pointer ${
                  selectedStepId === s.id ? "bg-white border-l-4 border-l-signal-orange font-semibold" : "hover:bg-white/50"
                }`}
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  {renderStatusIcon(s.status)}
                  <span className="truncate text-[11px] text-carbon">{nodeLabel(s.nodeId)}</span>
                </div>
                {s.durationMs !== null && (
                  <span className="text-[10px] text-slate font-mono whitespace-nowrap">{s.durationMs}ms</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Console Content */}
      <div className="w-3/4 flex flex-col h-full bg-white">
        {selectedStep ? (
          <>
            {/* Step Header */}
            <header className="border-b border-chalk p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-carbon">{nodeLabel(selectedStep.nodeId)}</span>
                <span className="font-mono text-slate text-[10px]">({selectedStep.operationId})</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedStep.status === "failed" && selectedStep.error && (
                  <span className="text-red-600 bg-red-50 border border-red-100 rounded px-2 py-0.5 text-[10px] font-semibold">
                    {selectedStep.error.code}: {selectedStep.error.message}
                  </span>
                )}
                {selectedStep.status === "skipped" && (
                  <span className="text-slate bg-fog border border-chalk rounded px-2 py-0.5 text-[10px] font-semibold">
                    Skipped due to ancestor failure
                  </span>
                )}
              </div>
            </header>

            {/* Tabs */}
            <div className="flex border-b border-chalk bg-fog px-2">
              {(["request", "response", "inputs", "exports", "assertions"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-3 py-2 text-xs font-semibold capitalize transition-all cursor-pointer ${
                    activeTab === tab
                      ? "border-signal-orange text-signal-orange"
                      : "border-transparent text-slate hover:text-carbon"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Panel */}
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-5">
              {activeTab === "request" && renderRequestTab(selectedStep)}
              {activeTab === "response" && renderResponseTab(selectedStep)}
              {activeTab === "inputs" && renderInputsTab(selectedStep)}
              {activeTab === "exports" && renderExportsTab(selectedStep)}
              {activeTab === "assertions" && renderAssertionsTab(selectedStep)}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate italic">
            Select a step to view execution trace details.
          </div>
        )}
      </div>
    </div>
  );

  function renderStatusIcon(status: string) {
    switch (status) {
      case "succeeded":
        return <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" title="Succeeded" />;
      case "failed":
        return <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" title="Failed" />;
      case "running":
        return <span className="w-2.5 h-2.5 rounded-full bg-signal-orange inline-block animate-pulse" title="Running" />;
      case "skipped":
        return <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" title="Skipped" />;
      case "canceled":
        return <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" title="Canceled" />;
      default:
        return <span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block" title="Queued" />;
    }
  }

  function renderRequestTab(step: TestWorkflowStepRunDto) {
    const req = step.request as {
      method: string;
      serverUrl: string;
      path: string;
      query: Record<string, string>;
      headers: Record<string, string>;
      body: unknown;
    } | null;

    if (!req) return <span className="text-slate italic">No request data recorded.</span>;

    return (
      <div className="flex flex-col gap-2">
        <div>
          <span className="font-semibold text-carbon">URL:</span> {req.method} {req.serverUrl}{req.path}
        </div>
        {Object.keys(req.query).length > 0 && (
          <div>
            <span className="font-semibold text-carbon">Query Parameters:</span>
            <pre className="bg-fog p-2 rounded text-[10px] mt-1">{JSON.stringify(req.query, null, 2)}</pre>
          </div>
        )}
        <div>
          <span className="font-semibold text-carbon">Headers:</span>
          <pre className="bg-fog p-2 rounded text-[10px] mt-1">{JSON.stringify(req.headers, null, 2)}</pre>
        </div>
        {req.body !== undefined && (
          <div>
            <span className="font-semibold text-carbon">Body:</span>
            <pre className="bg-fog p-2 rounded text-[10px] mt-1">
              {typeof req.body === "string" ? req.body : JSON.stringify(req.body, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  function renderResponseTab(step: TestWorkflowStepRunDto) {
    const res = step.response as {
      status: number;
      headers: Record<string, string>;
      body: unknown;
    } | null;

    if (!res) return <span className="text-slate italic">No response data recorded.</span>;

    const isTruncated = res.body && typeof res.body === "object" && "truncated" in res.body;

    return (
      <div className="flex flex-col gap-2">
        <div>
          <span className="font-semibold text-carbon">Status:</span> {res.status}
        </div>
        <div>
          <span className="font-semibold text-carbon">Headers:</span>
          <pre className="bg-fog p-2 rounded text-[10px] mt-1">{JSON.stringify(res.headers, null, 2)}</pre>
        </div>
        <div>
          <span className="font-semibold text-carbon">Body:</span>
          {isTruncated ? (
            <div className="bg-amber-50 border border-amber-100 p-2 rounded text-[10px] mt-1 flex flex-col gap-1">
              <span className="text-amber-800 font-semibold">Body truncated (exceeded 64KB)</span>
              <pre className="font-mono mt-1">{(res.body as { preview: string }).preview}...</pre>
            </div>
          ) : (
            <pre className="bg-fog p-2 rounded text-[10px] mt-1">
              {typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  function renderInputsTab(step: TestWorkflowStepRunDto) {
    const inputs = step.inputs as { type: "env" | "var"; name?: string; key?: string; value: unknown }[] | null;

    if (!inputs || inputs.length === 0) return <span className="text-slate italic">No input references used in this step.</span>;

    return (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-carbon mb-2">Variables & Env Vars Substituted:</span>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-chalk text-left font-semibold text-slate text-[10px]">
              <th className="py-1">Reference</th>
              <th className="py-1">Value</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((inp, idx) => (
              <tr key={idx} className="border-b border-chalk last:border-b-0">
                <td className="py-1.5 font-mono text-[10px]">
                  {inp.type === "env" ? `{{env.${inp.key}}}` : `{{vars.${inp.name}}}`}
                </td>
                <td className="py-1.5 font-mono text-[10px] text-graphite break-all">
                  {typeof inp.value === "object" ? JSON.stringify(inp.value) : String(inp.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderExportsTab(step: TestWorkflowStepRunDto) {
    const exports = step.exports as Record<string, unknown> | null;

    if (!exports || Object.keys(exports).length === 0) return <span className="text-slate italic">No variables exported by this step.</span>;

    return (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-carbon mb-2">Exported Variables:</span>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-chalk text-left font-semibold text-slate text-[10px]">
              <th className="py-1">Name</th>
              <th className="py-1">Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(exports).map(([k, v]) => (
              <tr key={k} className="border-b border-chalk last:border-b-0">
                <td className="py-1.5 font-mono text-[10px] font-semibold">{k}</td>
                <td className="py-1.5 font-mono text-[10px] text-graphite break-all">
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderAssertionsTab(step: TestWorkflowStepRunDto) {
    const asserts = step.assertions as {
      id: string;
      type: string;
      passed: boolean;
      expected: unknown;
      actual: unknown;
      error?: string;
    }[] | null;

    if (!asserts || asserts.length === 0) return <span className="text-slate italic">No assertions configured for this step.</span>;

    return (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-carbon mb-2">Assertions Results:</span>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-chalk text-left font-semibold text-slate text-[10px]">
              <th className="py-1">ID / Type</th>
              <th className="py-1">Actual</th>
              <th className="py-1">Expected</th>
              <th className="py-1">Result</th>
            </tr>
          </thead>
          <tbody>
            {asserts.map((a) => (
              <tr key={a.id} className="border-b border-chalk last:border-b-0">
                <td className="py-1.5 font-mono text-[10px]">
                  <div>{a.id}</div>
                  <div className="text-[9px] text-slate uppercase">{a.type}</div>
                </td>
                <td className="py-1.5 font-mono text-[10px] text-graphite break-all pr-4">
                  {a.error ? <span className="text-red-500">{a.error}</span> : typeof a.actual === "object" ? JSON.stringify(a.actual) : String(a.actual ?? "")}
                </td>
                <td className="py-1.5 font-mono text-[10px] text-graphite break-all">
                  {typeof a.expected === "object" ? JSON.stringify(a.expected) : String(a.expected)}
                </td>
                <td className="py-1.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    a.passed ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {a.passed ? "Pass" : "Fail"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
