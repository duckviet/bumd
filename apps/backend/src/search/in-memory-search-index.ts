import { Injectable } from "@nestjs/common";
import type { SearchDocument, SearchIndex, SearchResult } from "./search-types.js";

@Injectable()
export class InMemorySearchIndex implements SearchIndex {
  private readonly documents = new Map<string, SearchDocument>();

  public async replaceVersionDocuments(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly versionId: string;
    readonly documents: readonly SearchDocument[];
  }): Promise<void> {
    for (const [key, document] of this.documents.entries()) {
      if (
        document.organizationId === input.organizationId &&
        document.docId === input.docId &&
        document.branchId === input.branchId
      ) {
        this.documents.delete(key);
      }
    }

    for (const document of input.documents) {
      this.documents.set(`${document.versionId}:${document.operationId}:${document.method}:${document.path}`, document);
    }
  }

  public async search(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId?: string;
    readonly versionId?: string;
    readonly query: string;
  }): Promise<SearchResult> {
    const query = input.query.trim().toLocaleLowerCase();
    const hits = [...this.documents.values()].filter((document) => matchesInput(document, input) && matchesQuery(document, query));
    return { hits };
  }
}

function matchesInput(
  document: SearchDocument,
  input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId?: string;
    readonly versionId?: string;
  },
): boolean {
  return (
    document.organizationId === input.organizationId &&
    document.docId === input.docId &&
    (input.branchId === undefined || document.branchId === input.branchId) &&
    (input.versionId === undefined || document.versionId === input.versionId)
  );
}

function matchesQuery(document: SearchDocument, query: string): boolean {
  if (query.length === 0) {
    return true;
  }
  const haystack = [
    document.operationId,
    document.method,
    document.path,
    document.summary,
    document.description,
    ...document.tags,
  ].join(" ").toLocaleLowerCase();
  return haystack.includes(query);
}

