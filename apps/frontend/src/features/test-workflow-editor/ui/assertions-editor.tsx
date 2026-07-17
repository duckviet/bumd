"use client";

import type { TestWorkflowNode, TestWorkflowAssertion } from "@/entities/test-workflow";

function generateId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);
}

type AssertionsEditorProps = {
  readonly node: TestWorkflowNode;
  readonly onChange: (assertions: readonly TestWorkflowAssertion[]) => void;
};

export function AssertionsEditor({ node, onChange }: AssertionsEditorProps) {
  const assertions = node.assertions || [];

  const handleAddAssertion = (type: TestWorkflowAssertion["type"]) => {
    const id = `assert_${generateId()}`;
    let newAssert: TestWorkflowAssertion;

    if (type === "status") {
      newAssert = { id, type: "status", operator: "equals", expected: 200 };
    } else if (type === "jsonPath") {
      newAssert = { id, type: "jsonPath", path: "$.status", operator: "equals", expected: "active" };
    } else if (type === "header") {
      newAssert = { id, type: "header", name: "Content-Type", operator: "equals", expected: "application/json" };
    } else {
      newAssert = { id, type: "responseTime", operator: "lessThan", expectedMs: 500 };
    }

    onChange([...assertions, newAssert]);
  };

  const handleRemoveAssertion = (id: string) => {
    onChange(assertions.filter((a) => a.id !== id));
  };

  const handleFieldChange = (id: string, updates: Partial<TestWorkflowAssertion>) => {
    const updated = assertions.map((a) => {
      if (a.id !== id) return a;
      const merged = { ...a, ...updates } as TestWorkflowAssertion;
      return merged;
    });
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex items-center justify-between">
        <label className="font-semibold text-carbon">Assertions</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => handleAddAssertion("status")}
            className="text-[9px] font-bold border border-chalk bg-white text-carbon hover:bg-fog px-1.5 py-0.5 rounded cursor-pointer"
          >
            + Status
          </button>
          <button
            type="button"
            onClick={() => handleAddAssertion("jsonPath")}
            className="text-[9px] font-bold border border-chalk bg-white text-carbon hover:bg-fog px-1.5 py-0.5 rounded cursor-pointer"
          >
            + JSON Path
          </button>
          <button
            type="button"
            onClick={() => handleAddAssertion("header")}
            className="text-[9px] font-bold border border-chalk bg-white text-carbon hover:bg-fog px-1.5 py-0.5 rounded cursor-pointer"
          >
            + Header
          </button>
          <button
            type="button"
            onClick={() => handleAddAssertion("responseTime")}
            className="text-[9px] font-bold border border-chalk bg-white text-carbon hover:bg-fog px-1.5 py-0.5 rounded cursor-pointer"
          >
            + Time
          </button>
        </div>
      </div>

      {assertions.length === 0 ? (
        <span className="text-slate italic text-[11px]">No assertions configured. Add status code, header, response time or body path checks to validate responses.</span>
      ) : (
        <div className="flex flex-col gap-3">
          {assertions.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 rounded border border-chalk bg-fog p-2 relative">
              <button
                type="button"
                onClick={() => handleRemoveAssertion(a.id)}
                className="absolute top-1 right-2 text-slate hover:text-red-500 font-bold text-sm cursor-pointer"
              >
                &times;
              </button>

              {/* Type tag */}
              <div className="flex items-center">
                <span className="text-[10px] font-bold text-signal-orange uppercase tracking-wider bg-orange-50 border border-orange-100 px-1 py-0.5 rounded">
                  {a.type}
                </span>
              </div>

              {/* Fields based on assertion type */}
              {a.type === "status" && (
                <div className="flex gap-2">
                  <div className="flex flex-col gap-0.5 w-1/2">
                    <span className="text-[10px] text-slate font-medium">Operator</span>
                    <select
                      value={a.operator}
                      onChange={(e) => handleFieldChange(a.id, { operator: e.target.value as never })}
                      className="rounded border border-chalk bg-white px-1 py-1 focus:border-signal-orange focus:outline-none text-[11px]"
                    >
                      <option value="equals">equals</option>
                      <option value="notEquals">notEquals</option>
                      <option value="in">in list</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5 w-1/2">
                    <span className="text-[10px] text-slate font-medium">Expected</span>
                    <input
                      type="text"
                      value={Array.isArray(a.expected) ? a.expected.join(", ") : String(a.expected)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (a.operator === "in") {
                          const list = val.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
                          handleFieldChange(a.id, { expected: list });
                        } else {
                          handleFieldChange(a.id, { expected: parseInt(val, 10) || 200 });
                        }
                      }}
                      className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}

              {a.type === "jsonPath" && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate font-medium">JSON Path</span>
                    <input
                      type="text"
                      value={a.path}
                      onChange={(e) => handleFieldChange(a.id, { path: e.target.value })}
                      className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex flex-col gap-0.5 w-1/2">
                      <span className="text-[10px] text-slate font-medium">Operator</span>
                      <select
                        value={a.operator}
                        onChange={(e) => handleFieldChange(a.id, { operator: e.target.value as never })}
                        className="rounded border border-chalk bg-white px-1 py-1 focus:border-signal-orange focus:outline-none text-[11px]"
                      >
                        <option value="exists">exists</option>
                        <option value="equals">equals</option>
                        <option value="notEquals">notEquals</option>
                        <option value="contains">contains</option>
                      </select>
                    </div>
                    {a.operator !== "exists" && (
                      <div className="flex flex-col gap-0.5 w-1/2">
                        <span className="text-[10px] text-slate font-medium">Expected</span>
                        <input
                          type="text"
                          value={String(a.expected ?? "")}
                          onChange={(e) => handleFieldChange(a.id, { expected: e.target.value })}
                          className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {a.type === "header" && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex flex-col gap-0.5 w-1/2">
                      <span className="text-[10px] text-slate font-medium">Header Name</span>
                      <input
                        type="text"
                        value={a.name}
                        onChange={(e) => handleFieldChange(a.id, { name: e.target.value })}
                        className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 w-1/2">
                      <span className="text-[10px] text-slate font-medium">Operator</span>
                      <select
                        value={a.operator}
                        onChange={(e) => handleFieldChange(a.id, { operator: e.target.value as never })}
                        className="rounded border border-chalk bg-white px-1 py-1 focus:border-signal-orange focus:outline-none text-[11px]"
                      >
                        <option value="exists">exists</option>
                        <option value="equals">equals</option>
                        <option value="contains">contains</option>
                      </select>
                    </div>
                  </div>
                  {a.operator !== "exists" && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate font-medium">Expected</span>
                      <input
                        type="text"
                        value={a.expected ?? ""}
                        onChange={(e) => handleFieldChange(a.id, { expected: e.target.value })}
                        className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                      />
                    </div>
                  )}
                </div>
              )}

              {a.type === "responseTime" && (
                <div className="flex gap-2">
                  <div className="flex flex-col gap-0.5 w-1/2">
                    <span className="text-[10px] text-slate font-medium">Operator</span>
                    <select
                      value={a.operator}
                      onChange={(e) => handleFieldChange(a.id, { operator: e.target.value as never })}
                      disabled
                      className="rounded border border-chalk bg-white px-1 py-1 text-[11px]"
                    >
                      <option value="lessThan">lessThan</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5 w-1/2">
                    <span className="text-[10px] text-slate font-medium">Expected (ms)</span>
                    <input
                      type="number"
                      value={a.expectedMs}
                      onChange={(e) => handleFieldChange(a.id, { expectedMs: parseInt(e.target.value, 10) || 500 })}
                      className="rounded border border-chalk bg-white px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
