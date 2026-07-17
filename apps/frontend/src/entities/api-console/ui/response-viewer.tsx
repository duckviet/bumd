"use client";

import type { ConsoleResponse } from "../model/types";
import { getStatusColorClass } from "../model/types";
import { prettyBody } from "@/shared/api/try-it-out-helpers";

type ResponseViewerProps = {
  readonly title?: string | undefined;
  readonly response: ConsoleResponse | null;
  readonly error: string | null;
  readonly activeTab: "body" | "headers";
  readonly onTabChange: (tab: "body" | "headers") => void;
  readonly emptyLabel?: string | undefined;
  readonly headersEmptyLabel?: string | undefined;
  readonly defaultStatusLabel?: string | undefined;
  readonly subtitle?: string | undefined;
};

export function ResponseViewer({
  title = "Response",
  response,
  error,
  activeTab,
  onTabChange,
  emptyLabel = "Send the request to see the response.",
  headersEmptyLabel = "No headers returned.",
  defaultStatusLabel = "Ready",
  subtitle,
}: ResponseViewerProps) {
  return (
    <div className="flex h-full flex-col bg-fog">
      <header className="flex items-center justify-between border-b border-chalk px-4 py-3 bg-white">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate">{title}</span>
            {response !== null ? (
              <div className={`text-xs font-mono font-bold px-2 py-0.5 border rounded ${getStatusColorClass(response.status)}`}>
                {response.status}
              </div>
            ) : (
              <div className="text-xs font-mono font-semibold px-2 py-0.5 border border-chalk bg-fog text-slate rounded">
                {defaultStatusLabel}
              </div>
            )}
          </div>
          {subtitle && (
            <h2 id="modal-title" className="text-sm font-semibold truncate text-carbon mt-0.5">
              {subtitle}
            </h2>
          )}
        </div>
      </header>

      <div className="flex border-b border-chalk px-4 bg-fog">
        {(["body", "headers"] as const).map((tab) => (
          <button
            className={`border-b-2 px-3 py-3 text-sm font-medium capitalize transition-all cursor-pointer ${
              activeTab === tab ? "border-signal-orange text-signal-orange" : "border-transparent text-slate hover:text-carbon"
            }`}
            key={tab}
            onClick={() => onTabChange(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {error !== null && (
        <p className="border-b border-orange-200 bg-orange-50 px-4 py-3 text-xs font-medium text-orange-800">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-white p-4 font-mono text-xs leading-5">
        {activeTab === "body" ? (
          response === null ? (
            <div className="flex h-full items-center justify-center text-slate italic text-xs">
              {emptyLabel}
            </div>
          ) : (
            <pre className="text-slate-800 whitespace-pre overflow-x-auto select-all">
              {prettyBody(response.body)}
            </pre>
          )
        ) : (
          response === null ? (
            <div className="flex h-full items-center justify-center text-slate italic text-xs">
              {emptyLabel}
            </div>
          ) : Object.keys(response.headers).length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate italic text-xs">
              {headersEmptyLabel}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {Object.entries(response.headers).map(([key, value]) => (
                  <tr key={key} className="border-b border-chalk last:border-b-0">
                    <td className="py-1 px-1 text-carbon font-semibold select-all text-[11px] align-top w-1/3">
                      {key}
                    </td>
                    <td className="py-1 px-2 text-graphite select-all text-[11px] break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
