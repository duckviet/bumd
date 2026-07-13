"use client";

import { useState, useEffect } from "react";
import type {
  TestWorkflowRunDetailDto,
} from "@/entities/test-workflow";
import { StepStatusIcon } from "./step-status-icon";
import {
  ConsoleRequestTab,
  ConsoleResponseTab,
  ConsoleInputsTab,
  ConsoleExportsTab,
  ConsoleAssertionsTab,
} from "./console-tabs";

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
                  <StepStatusIcon status={s.status} />
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
              {activeTab === "request" && <ConsoleRequestTab step={selectedStep} />}
              {activeTab === "response" && <ConsoleResponseTab step={selectedStep} />}
              {activeTab === "inputs" && <ConsoleInputsTab step={selectedStep} />}
              {activeTab === "exports" && <ConsoleExportsTab step={selectedStep} />}
              {activeTab === "assertions" && <ConsoleAssertionsTab step={selectedStep} />}
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
}

