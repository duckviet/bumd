import ky from "ky";
import { z } from "zod";
import type { SearchDocument, SearchIndex, SearchResult } from "./search-types.js";

const meiliSearchResponseSchema = z.object({
  hits: z.array(
    z.object({
      organizationId: z.string(),
      docId: z.string(),
      branchId: z.string(),
      versionId: z.string(),
      operationId: z.string(),
      method: z.string(),
      path: z.string(),
      tags: z.array(z.string()),
      summary: z.string(),
      description: z.string(),
      anchor: z.string(),
    }),
  ),
});

export class MeilisearchSearchIndex implements SearchIndex {
  private readonly indexUrl: URL;

  public constructor(
    baseUrl: string,
    private readonly apiKey: string | undefined,
    indexName = "bumd_operations",
  ) {
    this.indexUrl = new URL(`/indexes/${encodeURIComponent(indexName)}`, baseUrl);
  }

  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    try {
      await this.request(new URL(`${this.indexUrl.pathname}/settings`, this.indexUrl), {
        method: "PATCH",
        json: {
          filterableAttributes: ["organizationId", "docId", "branchId", "versionId"],
        },
      });
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize Meilisearch settings:", error);
    }
  }

  public async replaceVersionDocuments(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly versionId: string;
    readonly documents: readonly SearchDocument[];
  }): Promise<void> {
    await this.ensureInitialized();
    await this.request(new URL(`${this.indexUrl.pathname}/documents`, this.indexUrl), {
      method: "DELETE",
      searchParams: {
        filter: [
          equalityFilter("organizationId", input.organizationId),
          equalityFilter("docId", input.docId),
          equalityFilter("branchId", input.branchId),
        ].join(" AND "),
      },
    });
    if (input.documents.length === 0) {
      return;
    }
    await this.request(new URL(`${this.indexUrl.pathname}/documents`, this.indexUrl), {
      method: "POST",
      json: input.documents.map((document) => ({
        id: `${document.versionId}:${document.operationId}:${document.method}:${document.path}`,
        ...document,
      })),
      searchParams: { primaryKey: "id" },
    });
  }

  public async search(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId?: string;
    readonly versionId?: string;
    readonly query: string;
  }): Promise<SearchResult> {
    await this.ensureInitialized();
    const filters = [equalityFilter("organizationId", input.organizationId), equalityFilter("docId", input.docId)];
    if (input.branchId !== undefined) {
      filters.push(equalityFilter("branchId", input.branchId));
    }
    if (input.versionId !== undefined) {
      filters.push(equalityFilter("versionId", input.versionId));
    }
    const response = await this.request(new URL(`${this.indexUrl.pathname}/search`, this.indexUrl), {
      method: "POST",
      json: {
        q: input.query,
        filter: filters.join(" AND "),
        attributesToSearchOn: ["operationId", "path", "tags", "summary", "description"],
      },
    }).json<unknown>();
    return meiliSearchResponseSchema.parse(response);
  }

  private request(url: URL, options: Parameters<typeof ky>[1]): ReturnType<typeof ky> {
    return ky(url, {
      ...options,
      timeout: 5_000,
      retry: 0,
      headers: {
        ...(this.apiKey === undefined ? {} : { Authorization: `Bearer ${this.apiKey}` }),
      },
    });
  }
}

function equalityFilter(field: string, value: string): string {
  return `${field} = ${JSON.stringify(value)}`;
}

