import ky, { HTTPError } from "ky";
import { z } from "zod";

const backendErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const versionSchema = z.object({
  id: z.string(),
  sha256: z.string(),
  status: z.string(),
  sourceFormat: z.string().optional(),
  sequenceNumber: z.number().int().optional(),
  createdAt: z.string().optional(),
  readyAt: z.string().nullable().optional(),
});

const versionListSchema = z.object({
  versions: z.array(versionSchema),
});

const diffSchema = z
  .object({
    versionId: z.string().optional(),
    classification: z.string(),
    hasBreaking: z.boolean(),
    summaryMarkdown: z.string().optional(),
    diffMarkdown: z.string().optional(),
    diff_markdown: z.string().optional(),
  })
  .transform((value) => ({
    ...value,
    diffMarkdown: value.diffMarkdown ?? value.diff_markdown ?? "",
    summaryMarkdown: value.summaryMarkdown ?? "",
  }));

export type CatalogVersion = z.infer<typeof versionSchema>;
export type CatalogDiff = z.infer<typeof diffSchema>;
const jobStatusSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  versionId: z.string(),
  docId: z.string(),
  branchId: z.string(),
  attemptCount: z.number(),
  error: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CatalogJobStatus = z.infer<typeof jobStatusSchema>;

export class CatalogClientError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export async function fetchVersion(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
  readonly token: string;
}): Promise<CatalogVersion> {
  return parseCatalogResponse(versionSchema, versionUrl(input), input.token);
}

export async function fetchVersions(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly token: string;
}): Promise<readonly CatalogVersion[]> {
  const response = await parseCatalogResponse(versionListSchema, versionsUrl(input), input.token);
  return response.versions;
}

export async function fetchVersionDiff(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
  readonly token: string;
}): Promise<CatalogDiff> {
  return parseCatalogResponse(diffSchema, diffUrl(input), input.token);
}

export async function fetchJobStatus(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly jobId: string;
  readonly token: string;
}): Promise<CatalogJobStatus> {
  return parseCatalogResponse(jobStatusSchema, jobStatusUrl(input), input.token);
}

async function parseCatalogResponse<T>(
  schema: z.ZodType<T>,
  url: URL,
  token: string,
): Promise<T> {
  try {
    const rawResponse: unknown = await ky
      .get(url, {
        headers: {
          authorization: `Bearer ${token}`,
        },
        timeout: 10_000,
      })
      .json();

    return schema.parse(rawResponse);
  } catch (error) {
    if (error instanceof HTTPError) {
      throw new CatalogClientError(await readBackendError(error));
    }

    if (error instanceof z.ZodError) {
      throw new CatalogClientError("Backend response did not match the expected catalog schema");
    }

    throw error;
  }
}

function versionsUrl(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
}): URL {
  const path = `/v1/orgs/${encodeURIComponent(input.orgSlug)}/docs/${encodeURIComponent(input.docSlug)}/branches/${encodeURIComponent(input.branchSlug)}/versions`;
  return new URL(path, input.apiUrl);
}

function versionUrl(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
}): URL {
  const path = `/v1/orgs/${encodeURIComponent(input.orgSlug)}/docs/${encodeURIComponent(input.docSlug)}/branches/${encodeURIComponent(input.branchSlug)}/versions/${encodeURIComponent(input.versionId)}`;
  return new URL(path, input.apiUrl);
}

function diffUrl(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
}): URL {
  return new URL(`${versionUrl(input).pathname}/diff`, input.apiUrl);
}

function jobStatusUrl(input: { readonly apiUrl: string; readonly orgSlug: string; readonly jobId: string }): URL {
  return new URL(`/v1/orgs/${encodeURIComponent(input.orgSlug)}/jobs/${encodeURIComponent(input.jobId)}`, input.apiUrl);
}

async function readBackendError(error: HTTPError): Promise<string> {
  const text = await error.response.text();
  const parsedJson = parseJson(text);
  const parsed = backendErrorSchema.safeParse(parsedJson);

  if (!parsed.success) {
    return `Backend request failed with HTTP ${error.response.status}`;
  }

  return `${parsed.data.error.code}: ${parsed.data.error.message}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
