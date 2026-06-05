import { Body, Controller, HttpException, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import { AuthenticatedApiToken } from "../auth/api-token-request.js";
import type { ApiTokenAuthContext } from "../auth/auth-types.js";
import { DeployError, requestId } from "./deploy-errors.js";
import type { DeployResult } from "./deploy-types.js";
import { VersionsService } from "./versions.service.js";

@Controller("v1/versions")
@UseGuards(ApiTokenGuard)
export class VersionsController {
  public constructor(private readonly versionsService: VersionsService) {}

  @Post()
  public async create(
    @Body() body: unknown,
    @AuthenticatedApiToken() auth: ApiTokenAuthContext,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<unknown> {
    try {
      const result = await this.versionsService.deploy(body, auth);
      response.status(result.kind === "created" ? 202 : 200);
      return responseBody(result);
    } catch (error) {
      if (error instanceof DeployError) {
        throw new HttpException(
          {
            error: {
              code: error.code,
              message: error.message,
              requestId: requestId(),
              details: {},
            },
          },
          error.statusCode,
        );
      }
      throw error;
    }
  }

}

@Controller("v1/orgs/:orgSlug/docs/:docSlug/branches/:branchSlug/deploys")
@UseGuards(ApiTokenGuard)
export class DeploysController {
  public constructor(private readonly versionsService: VersionsService) {}

  @Post()
  public async create(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Body() body: unknown,
    @AuthenticatedApiToken() auth: ApiTokenAuthContext,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<unknown> {
    try {
      const result = await this.versionsService.deploy({ ...asObject(body), orgSlug, docSlug, branchSlug }, auth);
      response.status(result.kind === "created" ? 202 : 200);
      return responseBody(result);
    } catch (error) {
      if (error instanceof DeployError) {
        throw new HttpException(
          {
            error: {
              code: error.code,
              message: error.message,
              requestId: requestId(),
              details: {},
            },
          },
          error.statusCode,
        );
      }
      throw error;
    }
  }
}

function responseBody(result: DeployResult): unknown {
  switch (result.kind) {
    case "created":
      return {
        skipped: false,
        version: {
          id: result.version.id,
          sha256: result.version.sha256,
          status: result.version.status,
        },
        job: {
          id: result.job.id,
          status: result.job.status,
        },
      };
    case "skipped":
      return {
        skipped: true,
        version: {
          id: result.version.id,
          sha256: result.version.sha256,
          status: result.version.status,
        },
      };
  }
}

function asObject(value: unknown): object {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return {};
}
