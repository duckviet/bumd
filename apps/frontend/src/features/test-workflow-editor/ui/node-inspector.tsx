"use client";

import { useState } from "react";
import type { JsonValue, TestEnvironmentDto, TestWorkflowNode } from "@/entities/test-workflow";
import { RequestTemplateEditor } from "@/features/test-workflow-editor/ui/request-template-editor";
import { ExportsEditor } from "@/features/test-workflow-editor/ui/exports-editor";
import { AssertionsEditor } from "@/features/test-workflow-editor/ui/assertions-editor";
import { workflowPhases } from "@/features/test-workflow-editor/model/workflow-phases";

type InspectorTab = "general" | "request" | "exports" | "assertions";

type NodeInspectorProps = {
  readonly node: TestWorkflowNode;
  readonly environment: TestEnvironmentDto | null;
  readonly testData: Readonly<Record<string, JsonValue>>;
  readonly isStale: boolean;
  readonly onUpdateNode: (nodeId: string, updates: Partial<TestWorkflowNode>) => void;
  readonly onDeleteNode: (nodeId: string) => void;
};

export function NodeInspector({ node, environment, testData, isStale, onUpdateNode, onDeleteNode }: NodeInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("general");

  const handleTemplateChange = (template: TestWorkflowNode["requestTemplate"]) => {
    onUpdateNode(node.id, { requestTemplate: template });
  };

  const handleExportsChange = (exports: TestWorkflowNode["exports"]) => {
    onUpdateNode(node.id, { exports });
  };

  const handleAssertionsChange = (assertions: TestWorkflowNode["assertions"]) => {
    onUpdateNode(node.id, { assertions });
  };

  return (
    <div className="flex h-full flex-col bg-white border-l border-chalk">
      {/* Header */}
      <header className="border-b border-chalk p-4 flex flex-col gap-2 relative">
        <button
          type="button"
          onClick={() => onDeleteNode(node.id)}
          className="absolute top-4 right-4 text-xs font-bold text-red-500 hover:underline cursor-pointer"
        >
          Delete
        </button>
        <div className="flex items-center gap-1.5">
          <span className={`method-${node.method.toLowerCase()} text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded`}>
            {node.method}
          </span>
          <span className="font-semibold text-carbon text-xs truncate max-w-[200px]">{node.label}</span>
        </div>
        <div className="text-[10px] font-mono text-slate truncate">{node.path}</div>
        <div className="text-[10px] text-slate">Operation ID: <span className="font-mono">{node.operationId}</span></div>
      </header>

      {/* Warnings */}
      {isStale && (
        <div className="bg-amber-50 border-b border-amber-100 p-3 text-[11px] text-amber-800 flex flex-col gap-1">
          <span className="font-bold">Stale endpoint</span>
          <span>This endpoint no longer exists in the latest API spec. Remap or remove this node.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-chalk bg-fog px-2">
        {(["general", "request", "exports", "assertions"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-3 py-2 text-xs font-semibold capitalize cursor-pointer ${
              activeTab === tab
                ? "border-signal-orange text-signal-orange"
                : "border-transparent text-slate hover:text-carbon"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "general" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`node-phase-${node.id}`} className="text-xs font-semibold text-carbon">
                Execution phase
              </label>
              <select
                id={`node-phase-${node.id}`}
                value={node.phase}
                onChange={(event) => {
                  const phase = workflowPhases.find((option) => option.value === event.target.value);
                  if (phase) onUpdateNode(node.id, { phase: phase.value });
                }}
                className="h-10 rounded border border-chalk bg-white px-3 text-sm text-carbon focus:border-signal-orange focus:outline-none"
              >
                {workflowPhases.map((phase) => (
                  <option key={phase.value} value={phase.value}>{phase.label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs leading-relaxed text-slate">
              {workflowPhases.find((phase) => phase.value === node.phase)?.description}
            </p>
          </div>
        )}
        {activeTab === "request" && (
          <RequestTemplateEditor node={node} environment={environment} testData={testData} onChange={handleTemplateChange} />
        )}
        {activeTab === "exports" && (
          <ExportsEditor node={node} onChange={handleExportsChange} />
        )}
        {activeTab === "assertions" && (
          <AssertionsEditor node={node} onChange={handleAssertionsChange} />
        )}
      </div>
    </div>
  );
}
