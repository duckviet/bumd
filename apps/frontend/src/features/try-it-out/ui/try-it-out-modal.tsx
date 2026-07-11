"use client";

import { useEffect, useState, useMemo } from "react";
import { type ApiOperation, type KeyValueRow, createTryItOutDraft } from "@/entities/openapi";
import { type TryItOutResponse } from "@/shared/api/portal-client";
import { MethodBadge } from "@/shared/ui/portal-primitives";
import { resolvePath, rowsToRecord } from "@/shared/api/try-it-out-helpers";
import { type TryItOutModalProps } from "@/features/try-it-out/model/types";
import { RequestBuilder } from "@/features/try-it-out/ui/request-builder";
import { ResponseConsole } from "@/features/try-it-out/ui/response-console";

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

  const [pathParams, setPathParams] = useState<KeyValueRow[]>(() => [...draft.pathParams]);
  const [queryParams, setQueryParams] = useState<KeyValueRow[]>(() => [...draft.queryParams]);
  const [headers, setHeaders] = useState<KeyValueRow[]>(() => [...draft.headers]);
  const [bodyText, setBodyText] = useState(() => draft.bodyText);

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

  const autofocusRef = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el) {
      el.focus();
    }
  };

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

  const handleQueryParamsChange = (index: number, updates: Partial<KeyValueRow>) => {
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

  const handleHeadersChange = (index: number, updates: Partial<KeyValueRow>) => {
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

          <RequestBuilder
            requestTab={requestTab}
            onRequestTabChange={setRequestTab}
            operation={operation}
            pathParams={pathParams}
            onPathParamsChange={handlePathParamsChange}
            queryParams={queryParams}
            onQueryParamsChange={handleQueryParamsChange}
            onQueryParamDelete={handleQueryParamDelete}
            onQueryParamAdd={handleQueryParamAdd}
            headers={headers}
            onHeadersChange={handleHeadersChange}
            onHeaderDelete={handleHeaderDelete}
            onHeaderAdd={handleHeaderAdd}
            bodyText={bodyText}
            onBodyTextChange={setBodyText}
            validationErrors={validationErrors}
            autofocusRef={autofocusRef}
          />
        </section>

        <ResponseConsole
          response={response}
          error={error}
          responseTab={responseTab}
          onResponseTabChange={setResponseTab}
          operation={operation}
        />

      </div>
    </div>
  );
}
