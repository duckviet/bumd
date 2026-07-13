"use client";

import { useState, useEffect } from "react";
import type {
  TestEnvironmentDto,
  TestWorkflowNode,
  TestWorkflowRequestTemplate,
} from "@/entities/test-workflow";

type RequestTemplateEditorProps = {
  readonly node: TestWorkflowNode;
  readonly environment: TestEnvironmentDto | null;
  readonly onChange: (template: TestWorkflowRequestTemplate) => void;
};

type KeyValuePair = {
  readonly key: string;
  readonly value: string;
};

export function RequestTemplateEditor({ node, environment, onChange }: RequestTemplateEditorProps) {
  const { requestTemplate } = node;

  const [serverUrl, setServerUrl] = useState(requestTemplate.serverUrl ?? "");
  const [headers, setHeaders] = useState<KeyValuePair[]>([]);
  const [query, setQuery] = useState<KeyValuePair[]>([]);
  const [pathParams, setPathParams] = useState<KeyValuePair[]>([]);
  const [bodyPairs, setBodyPairs] = useState<KeyValuePair[]>([]);

  // Populate from template when node changes
  useEffect(() => {
    setServerUrl(requestTemplate.serverUrl ?? "");
    setHeaders(recordToPairs(requestTemplate.headers));
    setQuery(recordToPairs(requestTemplate.query));
    setPathParams(recordToPairs(requestTemplate.pathParams));
    
    if (requestTemplate.body === undefined || requestTemplate.body === null) {
      setBodyPairs([]);
    } else if (typeof requestTemplate.body === "object") {
      setBodyPairs(recordToPairs(requestTemplate.body as Record<string, unknown>));
    } else {
      try {
        const parsed = JSON.parse(requestTemplate.body as string);
        if (typeof parsed === "object" && parsed !== null) {
          setBodyPairs(recordToPairs(parsed));
        } else {
          setBodyPairs([{ key: "body", value: String(requestTemplate.body) }]);
        }
      } catch {
        setBodyPairs([{ key: "body", value: String(requestTemplate.body) }]);
      }
    }
  }, [node.id]);

  function recordToPairs(rec?: Record<string, unknown>): KeyValuePair[] {
    if (!rec) return [];
    return Object.entries(rec).map(([k, v]) => ({ key: k, value: String(v) }));
  }

  function pairsToRecord(pairs: KeyValuePair[]): Record<string, unknown> {
    const rec: Record<string, unknown> = {};
    for (const p of pairs) {
      if (p.key.trim() !== "") {
        rec[p.key.trim()] = p.value;
      }
    }
    return rec;
  }

  const triggerChange = (updates: {
    readonly serverUrl?: string;
    readonly headers?: KeyValuePair[];
    readonly query?: KeyValuePair[];
    readonly pathParams?: KeyValuePair[];
    readonly bodyPairs?: KeyValuePair[];
  }) => {
    const nextBodyPairs = updates.bodyPairs || bodyPairs;
    const bodyObj = pairsToRecord(nextBodyPairs);

    onChange({
      serverUrl: updates.serverUrl !== undefined ? updates.serverUrl : serverUrl || undefined,
      headers: pairsToRecord(updates.headers || headers),
      query: pairsToRecord(updates.query || query),
      pathParams: pairsToRecord(updates.pathParams || pathParams),
      body: Object.keys(bodyObj).length > 0 ? bodyObj : undefined,
    });
  };

  const environmentVariableTemplate = (key: string): string => `{{env.${key}}}`;

  const renderEnvironmentVariableSelect = (
    value: string,
    onSelect: (value: string) => void,
    fieldLabel: string,
  ) => {
    if (!environment || environment.variables.length === 0) {
      return null;
    }

    const templates = environment.variables.map((variable) => environmentVariableTemplate(variable.key));

    return (
      <select
        aria-label={`Use environment variable for ${fieldLabel}`}
        value={templates.includes(value) ? value : ""}
        onChange={(event) => {
          if (event.target.value) {
            onSelect(event.target.value);
          }
        }}
        className="w-full min-w-0 max-w-[125px] flex-1 rounded border border-chalk bg-fog px-1.5 py-1 font-mono text-[10px] text-carbon focus:border-signal-orange focus:outline-none"
      >
        <option value="">Env variable...</option>
        {environment.variables.map((variable) => (
          <option key={variable.id} value={environmentVariableTemplate(variable.key)}>
            {variable.key}
          </option>
        ))}
      </select>
    );
  };

  const handlePairChange = (
    type: "headers" | "query" | "pathParams" | "body",
    index: number,
    field: "key" | "value",
    val: string,
  ) => {
    const list =
      type === "headers" ? headers :
      type === "query" ? query :
      type === "pathParams" ? pathParams :
      bodyPairs;
    const updated = list.map((item, idx) => (idx === index ? { ...item, [field]: val } : item));
    if (type === "headers") {
      setHeaders(updated);
      triggerChange({ headers: updated });
    } else if (type === "query") {
      setQuery(updated);
      triggerChange({ query: updated });
    } else if (type === "pathParams") {
      setPathParams(updated);
      triggerChange({ pathParams: updated });
    } else {
      setBodyPairs(updated);
      triggerChange({ bodyPairs: updated });
    }
  };

  const handleAddPair = (type: "headers" | "query" | "pathParams" | "body") => {
    const list =
      type === "headers" ? headers :
      type === "query" ? query :
      type === "pathParams" ? pathParams :
      bodyPairs;
    const updated = [...list, { key: "", value: "" }];
    if (type === "headers") {
      setHeaders(updated);
    } else if (type === "query") {
      setQuery(updated);
    } else if (type === "pathParams") {
      setPathParams(updated);
    } else {
      setBodyPairs(updated);
    }
  };

  const handleRemovePair = (type: "headers" | "query" | "pathParams" | "body", index: number) => {
    const list =
      type === "headers" ? headers :
      type === "query" ? query :
      type === "pathParams" ? pathParams :
      bodyPairs;
    const updated = list.filter((_, idx) => idx !== index);
    if (type === "headers") {
      setHeaders(updated);
      triggerChange({ headers: updated });
    } else if (type === "query") {
      setQuery(updated);
      triggerChange({ query: updated });
    } else if (type === "pathParams") {
      setPathParams(updated);
      triggerChange({ pathParams: updated });
    } else {
      setBodyPairs(updated);
      triggerChange({ bodyPairs: updated });
    }
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Server URL */}
      <div className="flex flex-col gap-1">
        <label className="font-semibold text-carbon">Override Server URL</label>
        <div className="flex gap-1">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            onBlur={() => triggerChange({ serverUrl })}
            placeholder="https://api.example.com/v1"
            className="min-w-0 flex-1 rounded border border-chalk bg-white px-2 py-1.5 focus:border-signal-orange focus:outline-none"
          />
          {renderEnvironmentVariableSelect(serverUrl, (value) => {
            setServerUrl(value);
            triggerChange({ serverUrl: value });
          }, "server URL")}
        </div>
      </div>

      {/* Path Params */}
      {renderKeyValueSection("Path Parameters", "pathParams", pathParams)}

      {/* Query Params */}
      {renderKeyValueSection("Query Parameters", "query", query)}

      {/* Headers */}
      {renderKeyValueSection("Headers", "headers", headers)}

      {/* Request Body */}
      {renderKeyValueSection("Request Body (JSON)", "body", bodyPairs)}
    </div>
  );

  function renderKeyValueSection(
    title: string,
    type: "headers" | "query" | "pathParams" | "body",
    pairs: KeyValuePair[],
  ) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-carbon">{title}</label>
          <button
            type="button"
            onClick={() => handleAddPair(type)}
            className="text-[10px] font-bold text-signal-orange hover:opacity-80 cursor-pointer"
          >
            + Add
          </button>
        </div>
        {pairs.length === 0 ? (
          <span className="text-slate italic text-[11px]">No items configured</span>
        ) : (
          <div className="flex flex-col gap-1">
            {pairs.map((p, index) => (
              <div key={index} className="flex items-start gap-1">
                <input
                  type="text"
                  value={p.key}
                  onChange={(e) => handlePairChange(type, index, "key", e.target.value)}
                  placeholder="Key"
                  className="w-1/2 min-w-0 rounded border border-chalk px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                />
                <div className="flex w-1/2 min-w-0 flex-col gap-1">
                  <input
                    type="text"
                    value={p.value}
                    onChange={(e) => handlePairChange(type, index, "value", e.target.value)}
                    placeholder="Value"
                    className="w-full min-w-0 rounded border border-chalk px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                  />
                  {renderEnvironmentVariableSelect(
                    p.value,
                    (value) => handlePairChange(type, index, "value", value),
                    `${title} value`,
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePair(type, index)}
                  className="text-slate hover:text-red-500 font-bold px-1.5 cursor-pointer"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
