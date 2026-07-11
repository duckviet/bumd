"use client";

import { useState, useEffect } from "react";
import type { TestWorkflowNode, TestWorkflowRequestTemplate } from "@/entities/test-workflow";

type RequestTemplateEditorProps = {
  readonly node: TestWorkflowNode;
  readonly onChange: (template: TestWorkflowRequestTemplate) => void;
};

type KeyValuePair = {
  readonly key: string;
  readonly value: string;
};

export function RequestTemplateEditor({ node, onChange }: RequestTemplateEditorProps) {
  const { requestTemplate } = node;

  const [serverUrl, setServerUrl] = useState(requestTemplate.serverUrl ?? "");
  const [headers, setHeaders] = useState<KeyValuePair[]>([]);
  const [query, setQuery] = useState<KeyValuePair[]>([]);
  const [pathParams, setPathParams] = useState<KeyValuePair[]>([]);
  const [bodyText, setBodyText] = useState("");

  // Populate from template when node changes
  useEffect(() => {
    setServerUrl(requestTemplate.serverUrl ?? "");
    setHeaders(recordToPairs(requestTemplate.headers));
    setQuery(recordToPairs(requestTemplate.query));
    setPathParams(recordToPairs(requestTemplate.pathParams));
    
    if (requestTemplate.body === undefined || requestTemplate.body === null) {
      setBodyText("");
    } else if (typeof requestTemplate.body === "string") {
      setBodyText(requestTemplate.body);
    } else {
      setBodyText(JSON.stringify(requestTemplate.body, null, 2));
    }
  }, [node.id, requestTemplate]);

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
    readonly body?: unknown;
    readonly useRawBodyText?: boolean;
  }) => {
    let parsedBody: unknown = updates.body;
    if (updates.useRawBodyText) {
      if (bodyText.trim() !== "") {
        try {
          parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = bodyText;
        }
      } else {
        parsedBody = undefined;
      }
    } else if (updates.body === undefined) {
      if (bodyText.trim() !== "") {
        try {
          parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = bodyText;
        }
      } else {
        parsedBody = undefined;
      }
    }

    onChange({
      serverUrl: updates.serverUrl !== undefined ? updates.serverUrl : serverUrl || undefined,
      headers: pairsToRecord(updates.headers || headers),
      query: pairsToRecord(updates.query || query),
      pathParams: pairsToRecord(updates.pathParams || pathParams),
      body: parsedBody,
    });
  };

  const handlePairChange = (
    type: "headers" | "query" | "pathParams",
    index: number,
    field: "key" | "value",
    val: string,
  ) => {
    const list = type === "headers" ? headers : type === "query" ? query : pathParams;
    const updated = list.map((item, idx) => (idx === index ? { ...item, [field]: val } : item));
    if (type === "headers") {
      setHeaders(updated);
      triggerChange({ headers: updated });
    } else if (type === "query") {
      setQuery(updated);
      triggerChange({ query: updated });
    } else {
      setPathParams(updated);
      triggerChange({ pathParams: updated });
    }
  };

  const handleAddPair = (type: "headers" | "query" | "pathParams") => {
    const list = type === "headers" ? headers : type === "query" ? query : pathParams;
    const updated = [...list, { key: "", value: "" }];
    if (type === "headers") {
      setHeaders(updated);
    } else if (type === "query") {
      setQuery(updated);
    } else {
      setPathParams(updated);
    }
  };

  const handleRemovePair = (type: "headers" | "query" | "pathParams", index: number) => {
    const list = type === "headers" ? headers : type === "query" ? query : pathParams;
    const updated = list.filter((_, idx) => idx !== index);
    if (type === "headers") {
      setHeaders(updated);
      triggerChange({ headers: updated });
    } else if (type === "query") {
      setQuery(updated);
      triggerChange({ query: updated });
    } else {
      setPathParams(updated);
      triggerChange({ pathParams: updated });
    }
  };

  const handleBodyBlur = () => {
    triggerChange({ useRawBodyText: true });
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Server URL */}
      <div className="flex flex-col gap-1">
        <label className="font-semibold text-carbon">Override Server URL</label>
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          onBlur={() => triggerChange({ serverUrl })}
          placeholder="https://api.example.com/v1"
          className="rounded border border-chalk bg-white px-2 py-1.5 focus:border-signal-orange focus:outline-none"
        />
      </div>

      {/* Path Params */}
      {renderKeyValueSection("Path Parameters", "pathParams", pathParams)}

      {/* Query Params */}
      {renderKeyValueSection("Query Parameters", "query", query)}

      {/* Headers */}
      {renderKeyValueSection("Headers", "headers", headers)}

      {/* Request Body */}
      <div className="flex flex-col gap-1">
        <label className="font-semibold text-carbon">Request Body (JSON or Plain Text)</label>
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          onBlur={handleBodyBlur}
          placeholder='{\n  "key": "value"\n}'
          rows={6}
          className="rounded border border-chalk bg-white p-2 font-mono text-[11px] focus:border-signal-orange focus:outline-none"
        />
      </div>
    </div>
  );

  function renderKeyValueSection(title: string, type: "headers" | "query" | "pathParams", pairs: KeyValuePair[]) {
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
              <div key={index} className="flex items-center gap-1">
                <input
                  type="text"
                  value={p.key}
                  onChange={(e) => handlePairChange(type, index, "key", e.target.value)}
                  placeholder="Key"
                  className="w-1/2 rounded border border-chalk px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                />
                <input
                  type="text"
                  value={p.value}
                  onChange={(e) => handlePairChange(type, index, "value", e.target.value)}
                  placeholder="Value"
                  className="w-1/2 rounded border border-chalk px-1.5 py-1 focus:border-signal-orange focus:outline-none font-mono text-[11px]"
                />
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
