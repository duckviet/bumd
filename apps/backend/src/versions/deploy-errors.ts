import { randomUUID } from "node:crypto";

export class DeployError extends Error {
  public constructor(
    public readonly code: "invalid_deploy_request" | "unauthorized" | "forbidden" | "deploy_processing_failed",
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export function requestId(): string {
  return `req_${randomUUID().replaceAll("-", "")}`;
}
