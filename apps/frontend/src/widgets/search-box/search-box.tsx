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
    <section className="border-b border-[#1f2523]/15 bg-[#fffdf7] px-6 py-4" data-testid="doc-search">
      <form action="/api/search" onSubmit={(event) => void submit(event)}>
        <input name="orgSlug" type="hidden" value={orgSlug} />
        <input name="docSlug" type="hidden" value={docSlug} />
        <input name="branchSlug" type="hidden" value={branchSlug} />
        <input name="versionId" type="hidden" value={versionId} />
        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#65706b]" htmlFor="doc-search-query">
          Search
        </label>
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-[#1f2523]/20 bg-white px-3 py-2 text-sm"
            id="doc-search-query"
            name="q"
            placeholder="operationId, path, tag"
            type="search"
          />
          <button className="rounded bg-[#1f2523] px-3 py-2 text-sm font-semibold text-white" type="submit">
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
    <ul className="space-y-2">
      {results.hits.map((hit) => (
        <li key={`${hit.method}:${hit.path}`}>
          <a className="text-sm underline" href={`#${hit.anchor}`}>
            {hit.operationId}
          </a>
        </li>
      ))}
    </ul>
  );
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
