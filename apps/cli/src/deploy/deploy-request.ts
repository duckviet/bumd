import { createHash } from "node:crypto";
import { basename } from "node:path";
import { z } from "zod";
import { SourceFormat, type DeployRequestBody } from "./deploy-types.js";

export const deployResponseSchema = z.object({
  skipped: z.boolean(),
  version: z.object({
    id: z.string(),
    sha256: z.string(),
    status: z.string(),
  }),
  job: z
    .object({
      id: z.string(),
      status: z.string(),
    })
    .optional(),
});

export function buildDeployRequest(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly filePath: string;
  readonly sourceFormat: SourceFormat;
  readonly specBytes: Buffer;
}): { readonly body: DeployRequestBody; readonly localSha256: string } {
  const localSha256 = createHash("sha256").update(input.specBytes).digest("hex");
  return {
    localSha256,
    body: {
      filename: basename(input.filePath),
      sourceFormat: input.sourceFormat,
      specBase64: input.specBytes.toString("base64"),
    },
  };
}

export function inferSourceFormat(filePath: string, explicit: string | undefined): SourceFormat {
  if (explicit === SourceFormat.OpenApi || explicit === SourceFormat.AsyncApi) {
    return explicit;
  }
  return SourceFormat.OpenApi;
}
