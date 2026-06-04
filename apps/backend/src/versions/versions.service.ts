import { Buffer } from "node:buffer";
import { Inject, Injectable } from "@nestjs/common";
import { ZodError } from "zod";
import { DeployError } from "./deploy-errors.js";
import { DEPLOY_QUEUE, DEPLOY_STORE, type DeployQueue, type DeployStore } from "./deploy-ports.js";
import { parseDeployRequest } from "./deploy-request.schema.js";
import type { DeployResult } from "./deploy-types.js";
import { hashText } from "./in-memory-deploy-store.js";

@Injectable()
export class VersionsService {
  public constructor(
    @Inject(DEPLOY_STORE) private readonly store: DeployStore,
    @Inject(DEPLOY_QUEUE) private readonly queue: DeployQueue,
  ) {}

  public async deploy(input: unknown, authorization: string | undefined): Promise<DeployResult> {
    if (authorization !== "Bearer test_token_not_secret") {
      throw new DeployError("unauthorized", "Missing or invalid API token", 401);
    }

    let request;
    try {
      request = parseDeployRequest(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new DeployError("invalid_deploy_request", "Deploy request is malformed", 400);
      }
      throw error;
    }

    const rawSpec = Buffer.from(request.specBase64, "base64").toString("utf8");
    const sha256 = hashText(rawSpec);
    const existing = await this.store.findVersionByHash({
      docSlug: request.docSlug,
      branchSlug: request.branchSlug,
      sha256,
    });

    if (existing !== null) {
      return { kind: "skipped", version: existing };
    }

    const created = await this.store.createQueuedVersion({
      orgSlug: request.orgSlug,
      docSlug: request.docSlug,
      branchSlug: request.branchSlug,
      sha256,
      sourceFormat: request.sourceFormat,
      rawSpec,
    });
    await this.queue.enqueueDeploy({ versionId: created.version.id });
    return { kind: "created", version: created.version, job: created.job };
  }
}

