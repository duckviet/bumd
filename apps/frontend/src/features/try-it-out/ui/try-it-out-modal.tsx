"use client";

import { useEffect, useState, useMemo } from "react";
import { type ApiOperation, type KeyValueRow, createTryItOutDraft } from "@/entities/openapi";
import { type TryItOutResponse } from "@/shared/api/portal-client";
import { MethodBadge } from "@/shared/ui/portal-primitives";
import { resolvePath, rowsToRecord } from "@/shared/api/try-it-out-helpers";
import { type TryItOutModalProps } from "@/features/try-it-out/model/types";
import {
  KeyValueEditor,
  BodyEditor,
  ResponseViewer,
  type MultipartField,
  type ConsoleField,
  buildMultipartBody,
} from "@/entities/api-console";

export function jsonToFields(jsonStr: string): ConsoleField[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([k, v]) => ({
        id: `body-kv-${k}-${Math.random()}`,
        key: k,
        value: typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
        enabled: true,
        isCustom: true,
      }));
    }
  } catch {}
  return [];
}

export function fieldsToJson(fields: readonly ConsoleField[]): string {
  const obj: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.enabled && f.key.trim() !== "") {
      const val = f.value.trim();
      if (val === "true") {
        obj[f.key] = true;
      } else if (val === "false") {
        obj[f.key] = false;
      } else if (!isNaN(Number(val)) && val !== "") {
        obj[f.key] = Number(val);
      } else if (val.startsWith("{") || val.startsWith("[")) {
        try {
          obj[f.key] = JSON.parse(val);
        } catch {
          obj[f.key] = f.value;
        }
      } else {
        obj[f.key] = f.value;
      }
    }
  }
  return JSON.stringify(obj, null, 2);
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

  const draft = useMemo(() => createTryItOutDraft(operation), [operation]);

  const [pathParams, setPathParams] = useState<readonly ConsoleField[]>(() => [...draft.pathParams]);
  const [queryParams, setQueryParams] = useState<readonly ConsoleField[]>(() => [...draft.queryParams]);
  const [headers, setHeaders] = useState<readonly ConsoleField[]>(() => [...draft.headers]);
  const [bodyText, setBodyText] = useState(() => draft.bodyText);

  // Auto-detect body type
  const initialBodyType = operation.requestBody?.contentType?.startsWith("multipart/")
    ? "multipart"
    : draft.bodyText && jsonToFields(draft.bodyText).length > 0
    ? "key-value"
    : "json";

  const [bodyType, setBodyType] = useState<"json" | "key-value" | "multipart">(initialBodyType);
  const [keyValueFields, setKeyValueFields] = useState<readonly ConsoleField[]>(() => {
    if (draft.bodyText) {
      return jsonToFields(draft.bodyText);
    }
    return [];
  });
  const [multipartFields, setMultipartFields] = useState<readonly MultipartField[]>([]);

  const [response, setResponse] = useState<TryItOutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const resolvedPath = useMemo(() => {
    const paramsMap = rowsToRecord(pathParams);
    return resolvePath(operation.path, paramsMap);
  }, [operation.path, pathParams]);

  const handlePathParamsChange = (index: number, value: string) => {
    setPathParams((prev) => {
      const next = [...prev];
      const old = next[index];
      if (old) {
        next[index] = { ...old, value };
      }
      return next;
    });
  };

  const handleQueryParamsChange = (index: number, updates: Partial<ConsoleField>) => {
    setQueryParams((prev) => {
      const next = [...prev];
      const old = next[index];
      if (old) {
        next[index] = { ...old, ...updates };
      }
      return next;
    });
  };

  const handleQueryParamDelete = (index: number) => {
    setQueryParams((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQueryParamAdd = () => {
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

  const handleHeadersChange = (index: number, updates: Partial<ConsoleField>) => {
    setHeaders((prev) => {
      const next = [...prev];
      const old = next[index];
      if (old) {
        next[index] = { ...old, ...updates };
      }
      return next;
    });
  };

  const handleHeaderDelete = (index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const handleHeaderAdd = () => {
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

  const handleBodyTypeChange = (type: "json" | "key-value" | "multipart") => {
    setBodyType(type);
    if (type === "key-value" && bodyText) {
      const fields = jsonToFields(bodyText);
      if (fields.length > 0) {
        setKeyValueFields(fields);
      }
    } else if (type === "json" && keyValueFields.length > 0) {
      setBodyText(fieldsToJson(keyValueFields));
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    for (const p of pathParams) {
      if (p.value.trim() === "") {
        errors[`path-${p.key}`] = `${p.key} is required`;
      }
    }

    for (const q of queryParams) {
      if (q.enabled && q.required && q.value.trim() === "") {
        errors[`query-${q.key}`] = `${q.key} is required`;
      }
    }

    if (bodyType === "json") {
      if (bodyText.trim().length > 0) {
        try {
          JSON.parse(bodyText);
        } catch (err) {
          errors["body"] = err instanceof Error ? err.message : "Body must be valid JSON";
        }
      } else if (operation.requestBody?.required) {
        errors["body"] = "Request body is required";
      }
    } else if (bodyType === "key-value") {
      if (operation.requestBody?.required && keyValueFields.filter((f) => f.enabled && f.key.trim()).length === 0) {
        errors["body"] = "Request body is required";
      }
    } else {
      if (operation.requestBody?.required && multipartFields.filter((f) => f.enabled && f.key.trim()).length === 0) {
        errors["body"] = "Request body is required";
      }
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

      const finalHeaders = { ...headersMap };

      if (bodyType === "multipart") {
        const boundary = `----BumdBoundary${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
        requestBody = buildMultipartBody(multipartFields, boundary);
        finalHeaders["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
      } else if (bodyType === "key-value") {
        requestBody = JSON.parse(fieldsToJson(keyValueFields));
      } else if (bodyText.trim().length > 0) {
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
          headers: finalHeaders,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="relative grid h-[calc(100dvh-32px)] lg:h-[min(760px,calc(100dvh-48px))] w-full max-w-[1160px] overflow-hidden rounded-xl border border-chalk bg-white shadow-2xl shadow-carbon/20 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_440px]">
        
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate hover:text-carbon hover:bg-fog transition-all p-1.5 rounded-lg z-20 cursor-pointer"
          aria-label="Close modal"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <aside className="hidden border-r border-chalk bg-fog p-4 lg:flex lg:flex-col overflow-y-auto">
          <div className="mb-3 rounded-lg border border-chalk bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate">
            Operations
          </div>
          <div className="space-y-1 overflow-y-auto flex-1 pr-1">
            {operations.map((op) => (
              <button
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                  op.id === operation.id
                    ? "bg-orange-50 border border-orange-200 text-orange-800 font-medium"
                    : "hover:bg-white/60 text-carbon border border-transparent"
                }`}
                key={op.id}
                onClick={() => onSelectOperation?.(op)}
                type="button"
                title={`${op.summary} (${op.path})`}
              >
                <MethodBadge method={op.method} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold" title={op.summary}>{op.summary}</span>
                  <span className="block truncate font-mono text-[10px] text-slate" title={op.path}>{op.path}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col border-r border-chalk">
          <header className="flex flex-wrap items-center gap-2 border-b border-chalk px-4 py-3 bg-fog pr-12 lg:pr-4">
            <MethodBadge method={operation.method} />
            <input
              aria-label="Base URL"
              className="h-8 w-[200px] min-w-[200px] rounded-md border border-chalk hover:border-signal-orange/60 bg-white px-2 font-mono text-xs text-carbon focus:border-signal-orange focus:ring-1 focus:ring-signal-orange focus:outline-none transition-all shadow-sm"
              onChange={(event) => setBaseUrl(event.target.value)}
              value={baseUrl}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-carbon cursor-help hover:text-signal-orange transition-colors" title={resolvedPath}>
              {resolvedPath}
            </span>
            <button
              className="rounded-lg bg-signal-orange px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-signal-orange/80 disabled:cursor-not-allowed disabled:bg-slate hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              disabled={isSending}
              onClick={sendRequest}
              type="button"
            >
              {isSending ? "Sending" : "Send"}
            </button>
          </header>

          <div className="flex flex-col min-h-0 flex-1">
            <div className="flex border-b border-chalk px-4 bg-fog">
              {(["params", "headers", "body"] as const).map((tab) => (
                <button
                  className={`border-b-2 px-3 py-3 text-sm font-medium capitalize transition-all cursor-pointer ${
                    requestTab === tab ? "border-signal-orange text-signal-orange" : "border-transparent text-slate hover:text-carbon"
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
                  {pathParams.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate mb-3">Path Parameters</h4>
                      <div className="space-y-4">
                        {pathParams.map((param, index) => (
                          <div key={param.id}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-semibold text-carbon font-mono">
                                {param.key} <span className="text-red-500">*</span>
                              </span>
                              {param.description && (
                                <span className="text-[10px] text-slate max-w-[70%] truncate" title={param.description}>
                                  {param.description}
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              className={`w-full rounded-lg border px-3 py-1.5 text-xs font-mono transition-all border-chalk hover:border-signal-orange/60 focus:border-signal-orange focus:ring-1 focus:ring-signal-orange focus:outline-none`}
                              value={param.value}
                              onChange={(e) => handlePathParamsChange(index, e.target.value)}
                            />
                            {validationErrors[`path-${param.key}`] && (
                              <p className="mt-1 text-[10px] text-red-500">{validationErrors[`path-${param.key}`]}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <KeyValueEditor
                    title="Query Parameters"
                    fields={queryParams}
                    onChange={(updated) => setQueryParams(updated as KeyValueRow[])}
                    onAdd={handleQueryParamAdd}
                    addLabel="+ Add parameter"
                    emptyLabel="No query parameters defined."
                    errorPrefix="query"
                    validationErrors={validationErrors}
                  />
                </div>
              )}

              {requestTab === "headers" && (
                <KeyValueEditor
                  title="Headers"
                  fields={headers}
                  onChange={(updated) => setHeaders(updated as KeyValueRow[])}
                  onAdd={handleHeaderAdd}
                  addLabel="+ Add header"
                  emptyLabel="No headers defined."
                  errorPrefix="header"
                  validationErrors={validationErrors}
                />
              )}

              {requestTab === "body" && (
                <BodyEditor
                  bodyType={bodyType}
                  onBodyTypeChange={handleBodyTypeChange}
                  bodyText={bodyText}
                  onBodyTextChange={setBodyText}
                  keyValueFields={keyValueFields}
                  onKeyValueFieldsChange={setKeyValueFields}
                  multipartFields={multipartFields}
                  onMultipartFieldsChange={setMultipartFields}
                  validationErrors={validationErrors}
                  required={operation.requestBody?.required}
                  contentTypeLabel={operation.requestBody?.contentType}
                />
              )}
            </div>
          </div>
        </section>

        <ResponseViewer
          response={response}
          error={error}
          activeTab={responseTab}
          onTabChange={setResponseTab}
          subtitle={operation.summary}
        />

      </div>
    </div>
  );
}
