"use client";

import type { ApiOperation, KeyValueRow } from "@/entities/openapi";
import { KeyValueTable } from "@/features/try-it-out/ui/key-value-table";

type RequestBuilderProps = {
  readonly requestTab: "params" | "headers" | "body";
  readonly onRequestTabChange: (tab: "params" | "headers" | "body") => void;
  readonly operation: ApiOperation;
  readonly pathParams: readonly KeyValueRow[];
  readonly onPathParamsChange: (index: number, value: string) => void;
  readonly queryParams: readonly KeyValueRow[];
  readonly onQueryParamsChange: (index: number, updates: Partial<KeyValueRow>) => void;
  readonly onQueryParamDelete: (index: number) => void;
  readonly onQueryParamAdd: () => void;
  readonly headers: readonly KeyValueRow[];
  readonly onHeadersChange: (index: number, updates: Partial<KeyValueRow>) => void;
  readonly onHeaderDelete: (index: number) => void;
  readonly onHeaderAdd: () => void;
  readonly bodyText: string;
  readonly onBodyTextChange: (value: string) => void;
  readonly validationErrors: Record<string, string>;
  readonly autofocusRef?: ((el: HTMLInputElement | HTMLTextAreaElement | null) => void) | undefined;
};

export function RequestBuilder({
  requestTab,
  onRequestTabChange,
  operation,
  pathParams,
  onPathParamsChange,
  queryParams,
  onQueryParamsChange,
  onQueryParamDelete,
  onQueryParamAdd,
  headers,
  onHeadersChange,
  onHeaderDelete,
  onHeaderAdd,
  bodyText,
  onBodyTextChange,
  validationErrors,
  autofocusRef,
}: RequestBuilderProps) {
  const hasPathParams = pathParams.length > 0;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex border-b border-[#d9dedb] px-4 bg-[#fbfbfa]">
        {(["params", "headers", "body"] as const).map((tab) => (
          <button
            className={`border-b-2 px-3 py-3 text-sm font-medium capitalize transition-all ${
              requestTab === tab ? "border-[#ff682c] text-[#ff682c]" : "border-transparent text-[#65706b] hover:text-[#202020]"
            }`}
            key={tab}
            onClick={() => onRequestTabChange(tab)}
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
                        onChange={(e) => onPathParamsChange(index, e.target.value)}
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
            <KeyValueTable
              title="Query Parameters"
              rows={queryParams}
              onRowChange={onQueryParamsChange}
              onRowDelete={onQueryParamDelete}
              onAdd={onQueryParamAdd}
              addLabel="+ Add parameter"
              emptyLabel="No query parameters defined."
              errorPrefix="query"
              validationErrors={validationErrors}
              autofocusRef={!hasPathParams ? autofocusRef : undefined}
            />
          </div>
        )}

        {requestTab === "headers" && (
          <KeyValueTable
            title="Headers"
            rows={headers}
            onRowChange={onHeadersChange}
            onRowDelete={onHeaderDelete}
            onAdd={onHeaderAdd}
            addLabel="+ Add header"
            emptyLabel="No headers defined."
            errorPrefix="header"
            validationErrors={validationErrors}
          />
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
              onChange={(e) => onBodyTextChange(e.target.value)}
              placeholder="{\n  \n}"
              ref={!hasPathParams && queryParams.length === 0 ? autofocusRef : undefined}
            />
            {validationErrors["body"] && (
              <p className="mt-1 text-xs text-red-500 font-medium">{validationErrors["body"]}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
