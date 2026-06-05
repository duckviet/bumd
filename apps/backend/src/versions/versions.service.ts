import { Buffer } from "node:buffer";
import { Inject, Injectable } from "@nestjs/common";
import { ZodError } from "zod";
import { ApiTokenRole, ApiTokenScope, type ApiTokenAuthContext } from "../auth/auth-types.js";
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

  public async deploy(input: unknown, auth: ApiTokenAuthContext): Promise<DeployResult> {
    let request;
    try {
      request = parseDeployRequest(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new DeployError("invalid_deploy_request", "Deploy request is malformed", 400);
      }
      throw error;
    }

    if (!auth.scopes.includes(ApiTokenScope.DocsDeploy)) {
      throw new DeployError("forbidden", "API token is missing docs:deploy scope", 403);
    }
    if (!canDeploy(auth.role)) {
      throw new DeployError("forbidden", "API token role cannot deploy", 403);
    }
    if (auth.organizationId !== request.orgSlug) {
      throw new DeployError("forbidden", "API token cannot access this organization", 403);
    }

    const rawSpec = Buffer.from(request.specBase64, "base64").toString("utf8");
    const sha256 = hashText(rawSpec);
    const existing = await this.store.findVersionByHash({
      orgSlug: request.orgSlug,
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
      createdByTokenId: auth.tokenId,
    });
    await this.queue.enqueueDeploy({ versionId: created.version.id });
    return { kind: "created", version: created.version, job: created.job };
  }
}

function canDeploy(role: ApiTokenRole): boolean {
  switch (role) {
    case ApiTokenRole.Owner:
    case ApiTokenRole.Admin:
    case ApiTokenRole.Member:
      return true;
    case ApiTokenRole.Guest:
      return false;
  }
}
