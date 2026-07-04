import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import ky, { HTTPError } from "ky";
import { z } from "zod";
import { inferSourceFormat } from "@bumd/cli/deploy";
import type { AuthenticatedActionInputs } from "./oidc-token.js";

const diffResponseSchema = z.object({
  classification: z.string(),
  hasBreaking: z.boolean().optional(),
  has_breaking: z.boolean().optional(),
  markdown: z.string().optional(),
  diffMarkdown: z.string().optional(),
  diff_markdown: z.string().optional(),
});

const backendErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const DiffClassification = {
  None: "none",
  NonBreaking: "non_breaking",
  Breaking: "breaking",
  Warning: "warning",
  Unknown: "unknown",
} as const;

export type DiffClassification = (typeof DiffClassification)[keyof typeof DiffClassification];

export type ActionDiffResult = {
  readonly classification: DiffClassification;
  readonly hasBreaking: boolean;
  readonly markdown: string;
};

export class DiffClientError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export async function fetchDiffResult(inputs: AuthenticatedActionInputs): Promise<ActionDiffResult> {
  try {
    const raw = inputs.versionId === undefined ? await previewDiff(inputs) : await storedDiff(inputs);
    const parsed = diffResponseSchema.parse(raw);
    const classification = normalizeClassification(parsed.classification);
    return {
      classification,
      hasBreaking: parsed.hasBreaking ?? parsed.has_breaking ?? classification === DiffClassification.Breaking,
      markdown: parsed.markdown ?? parsed.diffMarkdown ?? parsed.diff_markdown ?? "No diff markdown returned.",
    };
  } catch (error) {
    if (error instanceof HTTPError) {
      throw new DiffClientError(await readBackendError(error));
    }
    if (error instanceof z.ZodError) {
      throw new DiffClientError("Backend diff response did not match the expected schema");
    }
    throw error;
  }
}

async function previewDiff(inputs: AuthenticatedActionInputs): Promise<unknown> {
  const specBytes = await readFile(inputs.filePath);
  return ky
    .post(previewDiffUrl(inputs), {
      json: {
        branchSlug: inputs.branchSlug,
        baseVersionId: inputs.baseVersionId,
        headVersionId: inputs.headVersionId,
        filename: basename(inputs.filePath),
        sourceFormat: inferSourceFormat(inputs.filePath, inputs.sourceFormat),
        specBase64: specBytes.toString("base64"),
      },
      headers: authHeaders(inputs.backendToken),
      timeout: 10_000,
      retry: { limit: 2, retryOnTimeout: true },
    })
    .json();
}

async function storedDiff(inputs: AuthenticatedActionInputs): Promise<unknown> {
  return ky
    .get(storedDiffUrl(inputs), {
      headers: authHeaders(inputs.backendToken),
      timeout: 10_000,
      retry: { limit: 2, retryOnTimeout: true },
    })
    .json();
}

function previewDiffUrl(inputs: AuthenticatedActionInputs): URL {
  const path = `/v1/orgs/${encodeURIComponent(inputs.orgSlug)}/docs/${encodeURIComponent(inputs.docSlug)}/diffs/preview`;
  return new URL(path, inputs.apiUrl);
}

function storedDiffUrl(inputs: AuthenticatedActionInputs): URL {
  const versionId = inputs.versionId ?? "";
  const path = `/v1/orgs/${encodeURIComponent(inputs.orgSlug)}/docs/${encodeURIComponent(inputs.docSlug)}/branches/${encodeURIComponent(inputs.branchSlug)}/versions/${encodeURIComponent(versionId)}/diff`;
  return new URL(path, inputs.apiUrl);
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function normalizeClassification(value: string): DiffClassification {
  switch (value) {
    case "none":
      return DiffClassification.None;
    case "non_breaking":
    case "non-breaking":
      return DiffClassification.NonBreaking;
    case "breaking":
      return DiffClassification.Breaking;
    case "warning":
      return DiffClassification.Warning;
    default:
      return DiffClassification.Unknown;
  }
}

async function readBackendError(error: HTTPError): Promise<string> {
  const text = await error.response.text();
  const parsed = backendErrorSchema.safeParse(JSON.parse(text));
  if (parsed.success) {
    return `${parsed.data.error.code}: ${parsed.data.error.message}`;
  }
  return `Diff request failed with HTTP ${error.response.status}`;
}
