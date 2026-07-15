"use client";

import { useState, useEffect } from "react";
import type {
  TestWorkflowRunDetailDto,
} from "@/entities/test-workflow";
import { StatusBadge, type StatusBadgeTone } from "@/shared/ui/status-badge";
import {
  groupRunStepsByPhase,
  summarizeRunErrors,
  type RunPhaseGroup,
} from "../model/run-console-model";
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

const phaseTones: Readonly<Record<RunPhaseGroup["phase"], StatusBadgeTone>> = {
  setup: "warning",
  test: "neutral",
  teardown: "success",
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
  const { primaryError, teardownFailures } = summarizeRunErrors(run);
  const phaseGroups = groupRunStepsByPhase(run.steps);

  return (
    <div className="flex h-[320px] flex-col overflow-hidden border-t border-chalk bg-white text-xs">
      <div className="flex flex-wrap items-center gap-2 border-b border-chalk bg-fog px-3 py-2">
        <StatusBadge label={run.metadataSnapshot.priority} tone="warning" />
        <StatusBadge label={run.metadataSnapshot.type} />
        {run.metadataSnapshot.tags.map((tag) => <StatusBadge key={tag} label={tag} />)}
        <span className="text-slate">
          Environment: {run.environmentSnapshot?.name ?? "No environment"}
        </span>
        {run.environmentSnapshot?.variables.map((variable) => (
          <StatusBadge
            key={variable.id}
            label={`${variable.key} · ${variable.secret ? "secret" : "plain"} · ${variable.hasValue ? "configured" : "empty"}`}
          />
        ))}
        {primaryError !== null && (
          <span className="font-semibold text-red-700">
            Primary run error: {primaryError.code}: {primaryError.message}
          </span>
        )}
        {teardownFailures.length > 0 && (
          <span className="font-semibold text-red-700">
            Teardown failures: {teardownFailures
              .map((failure) => `${nodeLabel(failure.nodeId)}: ${failure.error.code}`)
              .join(", ")}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
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
            phaseGroups.map(({ phase, steps }) => {
              return (
                <section key={phase} aria-label={`${phase} phase`}>
                  <div className="flex items-center justify-between border-b border-chalk px-2 py-1">
                    <StatusBadge label={phase} tone={phaseTones[phase]} />
                    <span className="text-slate">{steps.length}</span>
                  </div>
                  {steps.map((s) => (
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
                  ))}
                </section>
              );
            })
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
    </div>
  );
}
