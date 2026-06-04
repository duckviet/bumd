import { z } from "zod";
import { SourceFormat, type DeployRequest } from "./deploy-types.js";

const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export const deployRequestSchema = z.object({
  orgSlug: z.string().min(1),
  docSlug: z.string().min(1),
  branchSlug: z.string().min(1),
  filename: z.string().min(1),
  sourceFormat: z.union([z.literal(SourceFormat.OpenApi), z.literal(SourceFormat.AsyncApi)]),
  specBase64: z.string().min(4).regex(base64Pattern),
});

export function parseDeployRequest(input: unknown): DeployRequest {
  return deployRequestSchema.parse(input);
}

