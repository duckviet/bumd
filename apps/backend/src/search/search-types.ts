export type SearchDocument = {
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly versionId: string;
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly description: string;
  readonly anchor: string;
};

export type SearchResult = {
  readonly hits: readonly SearchDocument[];
};

export type SearchIndex = {
  readonly replaceVersionDocuments: (input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly versionId: string;
    readonly documents: readonly SearchDocument[];
  }) => Promise<void>;
  readonly search: (input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId?: string;
    readonly versionId?: string;
    readonly query: string;
  }) => Promise<SearchResult>;
};

export const SEARCH_INDEX = Symbol("SEARCH_INDEX");

