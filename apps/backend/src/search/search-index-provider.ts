import { InMemorySearchIndex } from "./in-memory-search-index.js";
import { MeilisearchSearchIndex } from "./meilisearch-search-index.js";
import type { SearchIndex } from "./search-types.js";

export function createSearchIndex(inMemorySearchIndex: InMemorySearchIndex): SearchIndex {
  const meilisearchUrl = process.env["BUMD_MEILISEARCH_URL"];
  if (meilisearchUrl === undefined || meilisearchUrl.length === 0) {
    return inMemorySearchIndex;
  }
  return new MeilisearchSearchIndex(meilisearchUrl, process.env["BUMD_MEILISEARCH_API_KEY"]);
}

