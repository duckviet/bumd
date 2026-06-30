"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { SearchResponse } from "../../shared/api/portal-client";

export function SearchBox({
  orgSlug,
  docSlug,
  branchSlug,
  versionId,
}: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
}): React.ReactElement {
  const [results, setResults] = useState<SearchResponse>({ hits: [] });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = stringValue(form.get("q"));
    const response = await fetch(
      `/api/search?orgSlug=${encodeURIComponent(orgSlug)}&docSlug=${encodeURIComponent(docSlug)}&branchSlug=${encodeURIComponent(branchSlug)}&versionId=${encodeURIComponent(versionId)}&q=${encodeURIComponent(query)}`,
    );
    const body: SearchResponse = await response.json();
    setResults(body);
  }

  return (
    <section className="border-b border-chalk bg-paper/50 px-8 py-5 max-w-7xl mx-auto" data-testid="doc-search">
      <form action="/api/search" onSubmit={(event) => void submit(event)}>
        <input name="orgSlug" type="hidden" value={orgSlug} />
        <input name="docSlug" type="hidden" value={docSlug} />
        <input name="branchSlug" type="hidden" value={branchSlug} />
        <input name="versionId" type="hidden" value={versionId} />
        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate font-inter" htmlFor="doc-search-query">
          Search
        </label>
        <div className="mt-2 flex gap-3">
          <input
            className="min-w-0 flex-1 rounded-lg border border-chalk bg-white px-4 py-2 text-sm focus:border-signal-orange outline-none transition-colors"
            id="doc-search-query"
            name="q"
            placeholder="Search operationId, path, tag..."
            type="search"
          />
          <button className="rounded-full bg-carbon px-6 py-2 text-sm font-semibold text-white hover:bg-graphite transition-colors cursor-pointer" type="submit">
            Search
          </button>
        </div>
      </form>
      {results.hits.length > 0 ? <SearchResults results={results} /> : null}
    </section>
  );
}

export function SearchResults({ results }: { readonly results: SearchResponse }): React.ReactElement {
  return (
    <ul className="mt-4 space-y-2.5 bg-fog p-4 rounded-lg border border-chalk">
      {results.hits.map((hit) => (
        <li key={`${hit.method}:${hit.path}`} className="flex items-center gap-2">
          <span className="rounded bg-carbon px-2 py-0.5 font-mono text-[10px] text-white uppercase">{hit.method}</span>
          <a className="text-sm font-medium text-signal-orange hover:underline" href={`#${hit.anchor}`}>
            {hit.operationId} <span className="text-xs text-slate font-mono font-normal">({hit.path})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
