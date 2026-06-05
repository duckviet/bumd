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
    <section className="mt-8 border-t border-[#1f2523]/15 pt-5" data-testid="try-it-out-panel">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Try it out</h2>
      {operation === null || serverUrl.length === 0 ? (
        <p className="mt-3 text-sm text-[#65706b]">No runnable operation.</p>
      ) : (
        <form action="/api/try-it-out" className="mt-4 space-y-3" method="post" onSubmit={(event) => void submit(event)}>
          <input name="orgSlug" type="hidden" value={orgSlug} />
          <input name="docSlug" type="hidden" value={docSlug} />
          <input name="branchSlug" type="hidden" value={branchSlug} />
          <input name="versionId" type="hidden" value={versionId} />
          <input name="serverUrl" type="hidden" value={serverUrl} />
          <input name="method" type="hidden" value={operation.method} />
          <input name="path" type="hidden" value={operation.path} />
          <div className="rounded border border-[#1f2523]/15 bg-[#fffdf7] p-3">
            <p className="font-mono text-xs">
              {operation.method} {operation.path}
            </p>
            <p className="mt-2 text-sm text-[#65706b]">{operation.summary}</p>
          </div>
          <button className="w-full rounded bg-[#b8613b] px-3 py-2 text-sm font-semibold text-white" type="submit">
            Send through proxy
          </button>
          {result === null ? null : (
            <output className="block rounded border border-[#1f2523]/15 bg-white p-3 text-sm">
              <span className="font-semibold">Status {result.status}</span>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{result.body}</pre>
            </output>
          )}
        </form>
      )}
    </section>
  );
}
