import ky, { HTTPError } from "ky";
import { z } from "zod";
import { deployResponseSchema } from "./deploy-request.js";
import type { DeployCommandResult, DeployRequestBody } from "./deploy-types.js";

const backendErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export class DeployClientError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export async function postDeploy(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly token: string;
  readonly body: DeployRequestBody;
  readonly localSha256: string;
}): Promise<DeployCommandResult> {
  try {
    const rawResponse = await ky
      .post(deployUrl(input), {
        json: input.body,
        headers: {
          Authorization: `Bearer ${input.token}`,
        },
        timeout: 10_000,
        retry: {
          limit: 2,
          retryOnTimeout: true,
        },
      })
      .json();
    const response = deployResponseSchema.parse(rawResponse);

    const result: DeployCommandResult = {
      skipped: response.skipped,
      localSha256: input.localSha256,
      version: response.version,
    };
    if (response.job !== undefined) {
      return { ...result, job: response.job };
    }
    return result;
  } catch (error) {
    if (error instanceof HTTPError) {
      throw new DeployClientError(await readBackendError(error));
    }
    if (error instanceof z.ZodError) {
      throw new DeployClientError("Backend deploy response did not match the expected schema");
    }
    throw error;
  }
}

function deployUrl(input: {
  readonly apiUrl: string;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
}): URL {
  const path = `/v1/orgs/${encodeURIComponent(input.orgSlug)}/docs/${encodeURIComponent(input.docSlug)}/branches/${encodeURIComponent(input.branchSlug)}/deploys`;
  return new URL(path, input.apiUrl);
}

async function readBackendError(error: HTTPError): Promise<string> {
  const text = await error.response.text();
  const parsed = backendErrorSchema.safeParse(JSON.parse(text));
  if (parsed.success) {
    return `${parsed.data.error.code}: ${parsed.data.error.message}`;
  }
  return `Deploy request failed with HTTP ${error.response.status}`;
}
