"use client";

import { useEffect, useState, useMemo } from "react";
import type { ApiOperation } from "../../entities/openapi/model";
import { type TryItOutResponse } from "../../shared/api/portal-client";
import { MethodBadge } from "../../shared/ui/portal-primitives";
import { resolvePath, rowsToRecord, prettyBody } from "./try-it-out-utils";

type TryItOutModalProps = {
  readonly branchSlug: string;
  readonly docSlug: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly operation: ApiOperation | null;
  readonly operations?: readonly ApiOperation[];
  readonly onSelectOperation?: (operation: ApiOperation) => void;
  readonly orgSlug: string;
  readonly versionId: string;
  readonly servers?: readonly string[];
};

type KeyValueRow = {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly required: boolean;
  readonly description: string | undefined;
  readonly enabled: boolean;
  readonly isCustom: boolean | undefined;
};

function getStatusColorClass(status: number): string {
  if (status >= 200 && status < 300) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status >= 300 && status < 400) return "text-blue-700 bg-blue-50 border-blue-200";
  if (status >= 400 && status < 500) return "text-amber-700 bg-amber-50 border-amber-200";
  if (status >= 500) return "text-rose-700 bg-rose-50 border-rose-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

export function TryItOutModal(props: TryItOutModalProps) {
  if (!props.isOpen || !props.operation) {
    return null;
  }
  return <TryItOutModalContent key={props.operation.id} {...props} operation={props.operation} />;
}

function TryItOutModalContent({
  branchSlug,
  docSlug,
  onClose,
  operation,
  operations = [],
  onSelectOperation,
  orgSlug,
  versionId,
  servers = [],
}: TryItOutModalProps & { operation: ApiOperation }) {
  const [requestTab, setRequestTab] = useState<"params" | "headers" | "body">("params");
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  const [baseUrl, setBaseUrl] = useState(servers[0] ?? "https://api.example.com");

  // Path Parameters State
  const [pathParams, setPathParams] = useState<KeyValueRow[]>(() => {
    return operation.parameters
      .filter((p) => p.location === "path")
      .map((p) => ({
        id: `path-${p.name}`,
        key: p.name,
        value: String(p.example ?? p.default ?? ""),
        required: true,
        description: p.description ?? undefined,
        enabled: true,
        isCustom: false,
      }));
  });

  // Query Parameters State
  const [queryParams, setQueryParams] = useState<KeyValueRow[]>(() => {
    return operation.parameters
      .filter((p) => p.location === "query")
      .map((p) => ({
        id: `query-${p.name}`,
        key: p.name,
        value: String(p.example ?? p.default ?? ""),
        required: p.required,
        description: p.description ?? undefined,
        enabled: true,
        isCustom: false,
      }));
  });

  // Headers State
  const [headers, setHeaders] = useState<KeyValueRow[]>(() => {
    const seeded: KeyValueRow[] = [
      { id: "header-accept", key: "Accept", value: "application/json", required: false, enabled: true, description: undefined, isCustom: false },
    ];
    if (operation.requestBody?.contentType) {
      seeded.push({
        id: "header-content-type",
        key: "Content-Type",
        value: operation.requestBody.contentType,
        required: false,
        enabled: true,
        description: undefined,
        isCustom: false,
      });
    }
    const spec = operation.parameters
      .filter((p) => p.location === "header")
      .map((p) => ({
        id: `header-${p.name}`,
        key: p.name,
        value: String(p.example ?? p.default ?? ""),
        required: p.required,
        description: p.description ?? undefined,
        enabled: true,
        isCustom: false,
      }));
    return [...seeded, ...spec];
  });

  // Body State
  const [bodyText, setBodyText] = useState(() => {
    return operation.requestBody?.exampleText ?? "";
  });

  const [response, setResponse] = useState<TryItOutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Escape listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Autofocus handler
  const autofocusRef = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el) {
      el.focus();
    }
  };

  const hasPathParams = pathParams.length > 0;

  const resolvedPath = useMemo(() => {
    const paramsMap = rowsToRecord(pathParams);
    return resolvePath(operation.path, paramsMap);
  }, [operation.path, pathParams]);

  const addQueryParam = () => {
    setQueryParams((prev) => [
      ...prev,
      {
        id: `custom-query-${Date.now()}-${Math.random()}`,
        key: "",
        value: "",
        required: false,
        enabled: true,
        isCustom: true,
        description: undefined,
      },
    ]);
  };

  const addHeader = () => {
    setHeaders((prev) => [
      ...prev,
      {
        id: `custom-header-${Date.now()}-${Math.random()}`,
        key: "",
        value: "",
        required: false,
        enabled: true,
        isCustom: true,
        description: undefined,
      },
    ]);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    // Validate path params
    for (const p of pathParams) {
      if (p.value.trim() === "") {
        errors[`path-${p.key}`] = `${p.key} is required`;
      }
    }

    // Validate required query params
    for (const q of queryParams) {
      if (q.enabled && q.required && q.value.trim() === "") {
        errors[`query-${q.key}`] = `${q.key} is required`;
      }
    }

    // Validate JSON body
    if (bodyText.trim().length > 0) {
      try {
        JSON.parse(bodyText);
      } catch (err) {
        errors["body"] = err instanceof Error ? err.message : "Body must be valid JSON";
      }
    } else if (operation.requestBody?.required) {
      errors["body"] = "Request body is required";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const sendRequest = async () => {
    if (!validate()) {
      return;
    }

    setIsSending(true);
    setError(null);
    setResponse(null);

    try {
      const query = rowsToRecord(queryParams, { omitEmptyValue: true, omitEmptyKey: true });
      const headersMap = rowsToRecord(headers, { omitEmptyValue: false, omitEmptyKey: true });
      let requestBody: unknown;
      if (bodyText.trim().length > 0) {
        requestBody = JSON.parse(bodyText);
      }

      const res = await fetch("/api/try-it-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          docSlug,
          branchSlug,
          versionId,
          serverUrl: baseUrl,
          method: operation.method,
          path: resolvedPath,
          query,
          headers: headersMap,
          body: requestBody,
        }),
      });

      if (!res.ok) {
        throw new Error(`Proxy request failed with status ${res.status}`);
      }

      const resBody: TryItOutResponse = await res.json();
      setResponse(resBody);
      setResponseTab("body");
    } catch (caughtError) {
      if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("Request failed");
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#202020]/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="relative grid h-[calc(100dvh-32px)] lg:h-[min(760px,calc(100dvh-48px))] w-full max-w-[1160px] overflow-hidden rounded-xl border border-[#d9dedb] bg-white shadow-2xl shadow-[#202020]/20 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_440px]">
        
        {/* Absolute Close button in top-right corner of entire modal */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[#65706b] hover:text-[#202020] hover:bg-[#f5f5f5] transition-all p-1.5 rounded-lg z-20 cursor-pointer"
          aria-label="Close modal"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Left pane: Operations list */}
        <aside className="hidden border-r border-[#d9dedb] bg-[#f5f5f5] p-4 lg:flex lg:flex-col overflow-y-auto">
          <div className="mb-3 rounded-lg border border-[#d9dedb] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#65706b]">
            Operations
          </div>
          <div className="space-y-1 overflow-y-auto flex-1 pr-1">
            {operations.map((op) => (
              <button
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                  op.id === operation.id
                    ? "bg-[#fff3ed] border border-[#f0c8b6] text-[#9c3d13] font-medium"
                    : "hover:bg-white/60 text-[#202020] border border-transparent"
                }`}
                key={op.id}
                onClick={() => onSelectOperation?.(op)}
                type="button"
                title={`${op.summary} (${op.path})`}
              >
                <MethodBadge method={op.method} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold" title={op.summary}>{op.summary}</span>
                  <span className="block truncate font-mono text-[10px] text-[#65706b]" title={op.path}>{op.path}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Middle pane: Request builder */}
        <section className="flex min-w-0 flex-col border-r border-[#d9dedb]">
          <header className="flex flex-wrap items-center gap-2 border-b border-[#d9dedb] px-4 py-3 bg-[#fbfbfa] pr-12 lg:pr-4">
            <MethodBadge method={operation.method} />
            <input
              aria-label="Base URL"
              className="h-8 w-[200px] min-w-[200px] rounded-md border border-[#d9dedb] hover:border-[#ff682c]/60 bg-white px-2 font-mono text-xs text-[#202020] focus:border-[#ff682c] focus:ring-1 focus:ring-[#ff682c] focus:outline-none transition-all shadow-sm"
              onChange={(event) => setBaseUrl(event.target.value)}
              value={baseUrl}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-[#202020] cursor-help hover:text-[#ff682c] transition-colors" title={resolvedPath}>
              {resolvedPath}
            </span>
            <button
              className="rounded-lg bg-[#ff682c] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#e65b24] disabled:cursor-not-allowed disabled:bg-[#828282] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              disabled={isSending}
              onClick={sendRequest}
              type="button"
            >
              {isSending ? "Sending" : "Send"}
            </button>
          </header>

          <div className="flex border-b border-[#d9dedb] px-4 bg-[#fbfbfa]">
            {(["params", "headers", "body"] as const).map((tab) => (
              <button
                className={`border-b-2 px-3 py-3 text-sm font-medium capitalize transition-all ${
                  requestTab === tab ? "border-[#ff682c] text-[#ff682c]" : "border-transparent text-[#65706b] hover:text-[#202020]"
                }`}
                key={tab}
                onClick={() => setRequestTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 bg-white p-4 overflow-y-auto">
            {requestTab === "params" && (
              <div className="space-y-6">
                {/* Path Parameters Section */}
                {pathParams.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#828282] mb-3">Path Parameters</h4>
                    <div className="space-y-4">
                      {pathParams.map((param, index) => (
                        <div key={param.id}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold text-[#202020] font-mono">
                              {param.key} <span className="text-red-500">*</span>
                            </span>
                            {param.description && (
                              <span className="text-[10px] text-[#828282] max-w-[70%] truncate" title={param.description}>
                                {param.description}
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            className={`w-full rounded-lg border px-3 py-1.5 text-xs font-mono transition-all ${
                              validationErrors[`path-${param.key}`]
                                ? "border-red-500 bg-red-50/20 focus:border-red-500"
                                : "border-[#d9dedb] hover:border-[#ff682c]/60 focus:border-[#ff682c] focus:ring-1 focus:ring-[#ff682c] focus:outline-none"
                            }`}
                            value={param.value}
                            onChange={(e) => {
                              const newParams = [...pathParams];
                              const old = newParams[index];
                              if (old) {
                                newParams[index] = {
                                  ...old,
                                  value: e.target.value,
                                };
                                setPathParams(newParams);
                              }
                            }}
                            ref={index === 0 ? autofocusRef : undefined}
                          />
                          {validationErrors[`path-${param.key}`] && (
                            <p className="mt-1 text-[10px] text-red-500">{validationErrors[`path-${param.key}`]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Query Parameters Section */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#828282]">Query Parameters</h4>
                    <button
                      type="button"
                      onClick={addQueryParam}
                      className="text-xs text-[#ff682c] font-semibold hover:text-[#e65b24] transition-colors cursor-pointer"
                    >
                      + Add parameter
                    </button>
                  </div>
                  {queryParams.length === 0 ? (
                    <p className="text-xs text-[#828282] italic">No query parameters defined.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#edf0ee] text-left text-[11px] font-semibold text-[#828282]">
                            <th className="py-2 px-1 w-8 text-center">Use</th>
                            <th className="py-2 px-2 w-1/3">Key</th>
                            <th className="py-2 px-2">Value</th>
                            <th className="py-2 px-1 w-8 text-center"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {queryParams.map((row, index) => (
                            <tr key={row.id} className="border-b border-[#edf0ee] last:border-b-0 hover:bg-[#fbfbfa]/50">
                              <td className="py-2 px-1 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.enabled}
                                  onChange={(e) => {
                                    const newParams = [...queryParams];
                                    const old = newParams[index];
                                    if (old) {
                                      newParams[index] = {
                                        ...old,
                                        enabled: e.target.checked,
                                      };
                                      setQueryParams(newParams);
                                    }
                                  }}
                                  className="rounded border-[#d9dedb] text-[#ff682c] focus:ring-[#ff682c] accent-[#ff682c]"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={row.key}
                                  readOnly={!row.isCustom}
                                  disabled={!row.enabled}
                                  onChange={(e) => {
                                    const newParams = [...queryParams];
                                    const old = newParams[index];
                                    if (old) {
                                      newParams[index] = {
                                        ...old,
                                        key: e.target.value,
                                      };
                                      setQueryParams(newParams);
                                    }
                                  }}
                                  placeholder="parameter"
                                  className={`w-full rounded border px-2 py-1 font-mono text-xs transition-all ${
                                    row.isCustom
                                      ? "border-[#d9dedb] hover:border-[#ff682c]/60 focus:border-[#ff682c] focus:bg-white focus:outline-none"
                                      : "border-transparent bg-transparent text-[#4d4d4d] font-semibold focus:outline-none"
                                  }`}
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={row.value}
                                  disabled={!row.enabled}
                                  onChange={(e) => {
                                    const newParams = [...queryParams];
                                    const old = newParams[index];
                                    if (old) {
                                      newParams[index] = {
                                        ...old,
                                        value: e.target.value,
                                      };
                                      setQueryParams(newParams);
                                    }
                                  }}
                                  placeholder={row.required ? "required" : "optional"}
                                  className={`w-full rounded border px-2 py-1 font-mono text-xs transition-all ${
                                    validationErrors[`query-${row.key}`]
                                      ? "border-red-500 bg-red-50/20 focus:outline-none"
                                      : "border-[#d9dedb] bg-[#fbfbfa]/60 hover:border-[#ff682c]/60 focus:border-[#ff682c] focus:bg-white focus:outline-none"
                                  }`}
                                  ref={!hasPathParams && index === 0 ? autofocusRef : undefined}
                                />
                                {validationErrors[`query-${row.key}`] && (
                                  <p className="text-[9px] text-red-500 mt-0.5">{validationErrors[`query-${row.key}`]}</p>
                                )}
                              </td>
                              <td className="py-2 px-1 text-center">
                                {row.isCustom && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQueryParams(queryParams.filter((_, i) => i !== index));
                                    }}
                                    className="text-[#65706b] hover:text-red-500 font-semibold text-xs cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {requestTab === "headers" && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#828282]">Headers</h4>
                  <button
                    type="button"
                    onClick={addHeader}
                    className="text-xs text-[#ff682c] font-semibold hover:text-[#e65b24] transition-colors cursor-pointer"
                  >
                    + Add header
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#edf0ee] text-left text-[11px] font-semibold text-[#828282]">
                        <th className="py-2 px-1 w-8 text-center">Use</th>
                        <th className="py-2 px-2 w-1/3">Header</th>
                        <th className="py-2 px-2">Value</th>
                        <th className="py-2 px-1 w-8 text-center"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {headers.map((row, index) => (
                        <tr key={row.id} className="border-b border-[#edf0ee] last:border-b-0 hover:bg-[#fbfbfa]/50">
                          <td className="py-2 px-1 text-center">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(e) => {
                                const newHeaders = [...headers];
                                const old = newHeaders[index];
                                if (old) {
                                  newHeaders[index] = {
                                    ...old,
                                    enabled: e.target.checked,
                                  };
                                  setHeaders(newHeaders);
                                }
                              }}
                              className="rounded border-[#d9dedb] text-[#ff682c] focus:ring-[#ff682c] accent-[#ff682c]"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.key}
                              readOnly={!row.isCustom}
                              disabled={!row.enabled}
                              onChange={(e) => {
                                const newHeaders = [...headers];
                                const old = newHeaders[index];
                                if (old) {
                                  newHeaders[index] = {
                                    ...old,
                                    key: e.target.value,
                                  };
                                  setHeaders(newHeaders);
                                }
                              }}
                              placeholder="Header"
                              className={`w-full rounded border px-2 py-1 font-mono text-xs transition-all ${
                                row.isCustom
                                  ? "border-[#d9dedb] hover:border-[#ff682c]/60 focus:border-[#ff682c] focus:bg-white focus:outline-none"
                                  : "border-transparent bg-transparent text-[#4d4d4d] font-semibold focus:outline-none"
                              }`}
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={row.value}
                              disabled={!row.enabled}
                              onChange={(e) => {
                                const newHeaders = [...headers];
                                const old = newHeaders[index];
                                if (old) {
                                  newHeaders[index] = {
                                    ...old,
                                    value: e.target.value,
                                  };
                                  setHeaders(newHeaders);
                                }
                              }}
                              placeholder="value"
                              className="w-full rounded border border-[#d9dedb]/80 bg-[#fbfbfa]/60 hover:border-[#ff682c]/60 focus:border-[#ff682c] focus:bg-white focus:outline-none px-2 py-1 font-mono text-xs transition-all"
                            />
                          </td>
                          <td className="py-2 px-1 text-center">
                            {row.isCustom && (
                              <button
                                type="button"
                                onClick={() => {
                                  setHeaders(headers.filter((_, i) => i !== index));
                                }}
                                className="text-[#65706b] hover:text-red-500 font-semibold text-xs cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {requestTab === "body" && (
              <div className="h-full flex flex-col min-h-[340px]">
                <div className="mb-2 flex justify-between items-center">
                  <span className="text-xs font-semibold text-[#828282] uppercase tracking-wider">
                    JSON Payload {operation.requestBody?.required && <span className="text-red-500">*</span>}
                  </span>
                  {operation.requestBody?.contentType && (
                    <span className="text-[10px] bg-[#f5f5f5] text-[#4d4d4d] border border-[#d9dedb] px-2 py-0.5 rounded font-mono">
                      {operation.requestBody.contentType}
                    </span>
                  )}
                </div>
                <textarea
                  className={`flex-1 w-full min-h-[280px] resize-none rounded-lg border p-4 font-mono text-xs leading-5 transition-all focus:outline-none focus:ring-1 ${
                    validationErrors["body"]
                      ? "border-red-500 bg-red-50/10 focus:border-red-500 focus:ring-red-500"
                      : "border-[#d9dedb] bg-[#fbfbfa] focus:border-[#ff682c] focus:ring-[#ff682c] text-[#202020]"
                  }`}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder="{\n  \n}"
                  ref={!hasPathParams && queryParams.length === 0 ? autofocusRef : undefined}
                />
                {validationErrors["body"] && (
                  <p className="mt-1 text-xs text-red-500 font-medium">{validationErrors["body"]}</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right pane: Response Console */}
        <section className="flex min-w-0 flex-col bg-[#fbfbfa] pr-4">
          <header className="flex items-center justify-between border-b border-[#d9dedb] px-4 py-3 bg-white">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#828282]">Response</span>
                {response !== null ? (
                  <div className={`text-xs font-mono font-bold px-2 py-0.5 border rounded ${getStatusColorClass(response.status)}`}>
                    {response.status}
                  </div>
                ) : (
                  <div className="text-xs font-mono font-semibold px-2 py-0.5 border border-[#d9dedb] bg-[#f5f5f5] text-[#828282] rounded">
                    Ready
                  </div>
                )}
              </div>
              <h2 id="modal-title" className="text-sm font-semibold truncate text-[#202020] mt-0.5">
                {operation.summary}
              </h2>
            </div>
          </header>

          <div className="flex border-b border-[#d9dedb] px-4 bg-[#fbfbfa]">
            {(["body", "headers"] as const).map((tab) => (
              <button
                className={`border-b-2 px-3 py-3 text-sm font-medium capitalize transition-all ${
                  responseTab === tab ? "border-[#ff682c] text-[#ff682c]" : "border-transparent text-[#65706b] hover:text-[#202020]"
                }`}
                key={tab}
                onClick={() => setResponseTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          {error !== null && (
            <p className="border-b border-[#f0c8b6] bg-[#fff3ed] px-4 py-3 text-xs font-medium text-[#9c3d13]">
              {error}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-auto bg-white p-4 font-mono text-xs leading-5">
            {responseTab === "body" ? (
              response === null ? (
                <div className="flex h-full items-center justify-center text-[#828282] italic text-xs">
                  Send the request to see the response body.
                </div>
              ) : (
                <pre className="text-slate-800 whitespace-pre overflow-x-auto">
                  {prettyBody(response.body)}
                </pre>
              )
            ) : (
              response === null ? (
                <div className="flex h-full items-center justify-center text-[#828282] italic text-xs">
                  Send the request to see response headers.
                </div>
              ) : Object.keys(response.headers).length === 0 ? (
                <div className="flex h-full items-center justify-center text-[#828282] italic text-xs">
                  No headers returned.
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {Object.entries(response.headers).map(([key, value]) => (
                      <tr key={key} className="border-b border-[#edf0ee] last:border-b-0">
                        <td className="py-1 px-1 text-[#202020] font-semibold select-all text-[11px] align-top w-1/3">
                          {key}
                        </td>
                        <td className="py-1 px-2 text-[#4d4d4d] select-all text-[11px] break-all">
                          {value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
