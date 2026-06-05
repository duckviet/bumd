import { z } from "zod";
import { backendBaseUrl, PortalRevalidateSeconds } from "../config/env";

const visibilitySchema = z.union([z.literal("public"), z.literal("private")]);

const docSchema = z.object({
  slug: z.string(),
  name: z.string(),
  visibility: visibilitySchema,
  defaultBranchSlug: z.string(),
});

const latestReadyVersionSchema = z.union([
  z.object({
    id: z.string(),
    branchSlug: z.string(),
    sequenceNumber: z.number(),
    readyAt: z.string(),
    spec: z.record(z.string(), z.unknown()),
  }),
  z.object({
    version: z.null(),
  }),
]);

const changeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  hasBreaking: z.boolean(),
});

const diffDetailSchema = z.object({
  id: z.string(),
  diffMarkdown: z.string(),
});

const searchHitSchema = z.object({
  operationId: z.string(),
  method: z.string(),
  path: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
  description: z.string(),
  anchor: z.string(),
});

const searchResponseSchema = z.object({
  hits: z.array(searchHitSchema),
});

const tryItOutResponseSchema = z.object({
  status: z.number(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});

export type PortalDoc = z.infer<typeof docSchema>;
export type LatestReadyVersion = Exclude<z.infer<typeof latestReadyVersionSchema>, { readonly version: null }>;
export type ChangeSummary = z.infer<typeof changeSummarySchema>;
export type DiffDetail = z.infer<typeof diffDetailSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type TryItOutResponse = z.infer<typeof tryItOutResponseSchema>;

export async function fetchPortalDoc(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
}): Promise<PortalDoc> {
  return fetchJson(docUrl(input), docSchema);
}

export async function fetchLatestReadyVersion(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
}): Promise<LatestReadyVersion | null> {
  const result = await fetchJson(latestReadyVersionUrl(input), latestReadyVersionSchema);
  if ("version" in result) {
    return null;
  }
  return result;
}

export async function fetchChanges(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
}): Promise<readonly ChangeSummary[]> {
  const changes = await fetchJson(changesUrl(input), z.array(changeSummarySchema));
  return [...changes].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function fetchDiffDetail(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly changeId: string;
}): Promise<DiffDetail> {
  return fetchJson(diffDetailUrl(input), diffDetailSchema);
}

export async function searchPortalDoc(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly q: string;
  readonly branchSlug?: string;
  readonly versionId?: string;
  readonly apiToken?: string;
}): Promise<SearchResponse> {
  return fetchJson(searchUrl(input), searchResponseSchema, authHeaders(input.apiToken));
}

export async function executeTryItOut(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
  readonly body: unknown;
}): Promise<TryItOutResponse> {
  return postJson(tryItOutUrl(input), input.body, tryItOutResponseSchema);
}

async function fetchJson<T>(url: URL, schema: z.ZodType<T>, headers?: HeadersInit): Promise<T> {
  const response = await fetch(url, {
    ...(headers === undefined ? {} : { headers }),
    next: { revalidate: PortalRevalidateSeconds },
  });
  if (!response.ok) {
    throw new PortalBackendError(response.status, url.pathname);
  }
  return schema.parse(await response.json());
}

function authHeaders(apiToken: string | undefined): HeadersInit | undefined {
  if (apiToken === undefined || apiToken.length === 0) {
    return undefined;
  }
  return { Authorization: `Token ${apiToken}` };
}

async function postJson<T>(url: URL, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new PortalBackendError(response.status, url.pathname);
  }
  return schema.parse(await response.json());
}

export class PortalBackendError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly route: string,
  ) {
    super(`Backend portal request failed with HTTP ${statusCode}`);
  }
}

function docUrl(input: { readonly orgSlug: string; readonly docSlug: string }): URL {
  return backendUrl(`/v1/orgs/${segment(input.orgSlug)}/docs/${segment(input.docSlug)}`);
}

function latestReadyVersionUrl(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
}): URL {
  return backendUrl(`/v1/orgs/${segment(input.orgSlug)}/docs/${segment(input.docSlug)}/branches/${segment(input.branchSlug)}/versions/latest-ready`);
}

function changesUrl(input: { readonly orgSlug: string; readonly docSlug: string }): URL {
  return backendUrl(`/v1/orgs/${segment(input.orgSlug)}/docs/${segment(input.docSlug)}/changes`);
}

function diffDetailUrl(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly changeId: string;
}): URL {
  return backendUrl(`/v1/orgs/${segment(input.orgSlug)}/docs/${segment(input.docSlug)}/changes/${segment(input.changeId)}`);
}

function searchUrl(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly q: string;
  readonly branchSlug?: string;
  readonly versionId?: string;
}): URL {
  const url = backendUrl(`/v1/orgs/${segment(input.orgSlug)}/docs/${segment(input.docSlug)}/search`);
  url.searchParams.set("q", input.q);
  if (input.branchSlug !== undefined) {
    url.searchParams.set("branchSlug", input.branchSlug);
  }
  if (input.versionId !== undefined) {
    url.searchParams.set("versionId", input.versionId);
  }
  return url;
}

function tryItOutUrl(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
}): URL {
  return backendUrl(
    `/v1/orgs/${segment(input.orgSlug)}/docs/${segment(input.docSlug)}/branches/${segment(input.branchSlug)}/versions/${segment(input.versionId)}/try-it-out`,
  );
}

function backendUrl(path: string): URL {
  return new URL(path, backendBaseUrl());
}

function segment(value: string): string {
  return encodeURIComponent(value);
}
