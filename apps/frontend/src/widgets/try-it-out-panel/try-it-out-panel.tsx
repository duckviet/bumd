"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { ApiOperation } from "../../entities/openapi/model";
import type { TryItOutResponse } from "../../shared/api/portal-client";

export function TryItOutPanel({
  orgSlug,
  docSlug,
  branchSlug,
  versionId,
  serverUrl,
  operation,
}: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
  readonly serverUrl: string;
  readonly operation: ApiOperation | null;
}): React.ReactElement {
  const [result, setResult] = useState<TryItOutResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (operation === null) {
      return;
    }
    const response = await fetch("/api/try-it-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgSlug,
        docSlug,
        branchSlug,
        versionId,
        serverUrl,
        method: operation.method,
        path: operation.path,
      }),
    });
    const body: TryItOutResponse = await response.json();
    setResult(body);
  }

  return (
    <section className="mt-8 border-t border-chalk pt-5" data-testid="try-it-out-panel">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate font-inter">Try it out</h2>
      {operation === null || serverUrl.length === 0 ? (
        <p className="mt-3 text-sm text-slate italic">No runnable operation.</p>
      ) : (
        <form action="/api/try-it-out" className="mt-4 space-y-3" method="post" onSubmit={(event) => void submit(event)}>
          <input name="orgSlug" type="hidden" value={orgSlug} />
          <input name="docSlug" type="hidden" value={docSlug} />
          <input name="branchSlug" type="hidden" value={branchSlug} />
          <input name="versionId" type="hidden" value={versionId} />
          <input name="serverUrl" type="hidden" value={serverUrl} />
          <input name="method" type="hidden" value={operation.method} />
          <input name="path" type="hidden" value={operation.path} />
          <div className="rounded-lg border border-chalk bg-paper p-4 shadow-sm">
            <p className="font-mono text-xs text-signal-orange font-semibold">
              {operation.method} {operation.path}
            </p>
            <p className="mt-2 text-sm text-graphite font-inter leading-relaxed">{operation.summary}</p>
          </div>
          <button className="w-full rounded-full bg-carbon px-4 py-2.5 text-sm font-semibold text-white hover:bg-graphite transition-all cursor-pointer" type="submit">
            Send through proxy
          </button>
          {result === null ? null : (
            <output className="block rounded-lg border border-chalk bg-paper p-4 text-sm mt-4 shadow-sm">
              <span className="font-semibold text-signal-orange font-polysans text-md">Status {result.status}</span>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px] font-mono bg-fog p-3 rounded border border-chalk/70 text-carbon">{result.body}</pre>
            </output>
          )}
        </form>
      )}
    </section>
  );
}
