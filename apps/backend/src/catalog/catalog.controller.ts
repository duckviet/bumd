import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import type { ApiTokenRequest } from "../auth/api-token-request.js";
import { CatalogError, catalogHttpException } from "./catalog-errors.js";
import { CatalogService } from "./catalog.service.js";

@Controller("v1/orgs/:orgSlug/docs/:docSlug")
export class PortalDocsController {
  public constructor(private readonly catalog: CatalogService) {}

  @Get()
  public async doc(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string): Promise<unknown> {
    return this.handle(() => this.catalog.portalDoc(orgSlug, docSlug));
  }

  @Get("branches/:branchSlug/versions/latest-ready")
  public async latestReadyVersion(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
  ): Promise<unknown> {
    return this.handle(() => this.catalog.latestReadyVersion(orgSlug, docSlug, branchSlug));
  }

  @Get("branches/:branchSlug/versions/:versionId")
  public async version(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("versionId") versionId: string,
  ): Promise<unknown> {
    return this.handle(() => this.catalog.version(orgSlug, docSlug, branchSlug, versionId));
  }

  @Get("branches/:branchSlug/versions/:versionId/diff")
  public async versionDiff(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("versionId") versionId: string,
  ): Promise<unknown> {
    return this.handle(() => this.catalog.versionDiff(orgSlug, docSlug, branchSlug, versionId));
  }

  @Get("changes")
  public async changes(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string): Promise<unknown> {
    return this.handle(() => this.catalog.changes(orgSlug, docSlug));
  }

  @Get("changes/:diffId")
  public async changeDetail(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("diffId") diffId: string,
  ): Promise<unknown> {
    return this.handle(() => this.catalog.changeDetail(orgSlug, docSlug, diffId));
  }

  @Post("diffs/preview")
  @HttpCode(200)
  public async previewDiff(): Promise<unknown> {
    return this.handle(() => this.catalog.previewDiff());
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CatalogError) {
        throw catalogHttpException(error);
      }
      throw error;
    }
  }
}

@Controller("v1/orgs/:orgSlug/jobs")
@UseGuards(ApiTokenGuard)
export class CatalogJobsController {
  public constructor(private readonly catalog: CatalogService) {}

  @Get(":jobId")
  public async status(@Param("orgSlug") orgSlug: string, @Param("jobId") jobId: string) {
    return this.handle(() => this.catalog.jobStatus(orgSlug, jobId));
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CatalogError) {
        throw catalogHttpException(error);
      }
      throw error;
    }
  }
}

@Controller("v1/orgs/:orgSlug/members")
@UseGuards(ApiTokenGuard)
export class CatalogMembersController {
  public constructor(private readonly catalog: CatalogService) {}

  @Get()
  public async list(@Param("orgSlug") orgSlug: string, @Req() request: ApiTokenRequest) {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.listMembers(orgSlug, auth.organizationId);
    });
  }

  @Patch(":memberId")
  public async update(
    @Param("orgSlug") orgSlug: string,
    @Param("memberId") memberId: string,
    @Body() body: unknown,
    @Req() request: ApiTokenRequest,
  ) {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.updateMemberRole(orgSlug, auth.organizationId, memberId, body);
    });
  }

  @Delete(":memberId")
  @HttpCode(204)
  public async remove(@Param("orgSlug") orgSlug: string, @Param("memberId") memberId: string, @Req() request: ApiTokenRequest) {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.deleteMember(orgSlug, auth.organizationId, memberId);
    });
  }

  private requireManageAuth(request: ApiTokenRequest) {
    const auth = request.apiTokenAuth;
    if (!auth) {
      throw new CatalogError("unauthorized", 401, "Unauthorized");
    }
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }
    return auth;
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CatalogError) {
        throw catalogHttpException(error);
      }
      throw error;
    }
  }
}

@Controller("v1/orgs/:orgSlug/webhooks")
@UseGuards(ApiTokenGuard)
export class CatalogWebhooksController {
  public constructor(private readonly catalog: CatalogService) {}

  @Get()
  public async list(@Param("orgSlug") orgSlug: string, @Req() request: ApiTokenRequest): Promise<unknown> {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.listWebhooks(orgSlug);
    });
  }

  @Post()
  public async create(@Param("orgSlug") orgSlug: string, @Body() body: unknown, @Req() request: ApiTokenRequest): Promise<unknown> {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.createWebhook(orgSlug, body);
    });
  }

  @Post(":webhookId/rotate-secret")
  @HttpCode(200)
  public async rotateSecret(
    @Param("orgSlug") orgSlug: string,
    @Param("webhookId") webhookId: string,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.rotateWebhookSecret(orgSlug, webhookId);
    });
  }

  @Patch(":webhookId")
  public async update(
    @Param("orgSlug") orgSlug: string,
    @Param("webhookId") webhookId: string,
    @Body() body: unknown,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.updateWebhook(orgSlug, auth.organizationId, webhookId, body);
    });
  }

  @Delete(":webhookId")
  @HttpCode(204)
  public async remove(
    @Param("orgSlug") orgSlug: string,
    @Param("webhookId") webhookId: string,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.deleteWebhook(orgSlug, auth.organizationId, webhookId);
    });
  }

  @Get(":webhookId/deliveries")
  public async listDeliveries(
    @Param("orgSlug") orgSlug: string,
    @Param("webhookId") webhookId: string,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.listWebhookDeliveries(orgSlug, auth.organizationId, webhookId);
    });
  }

  private requireManageAuth(request: ApiTokenRequest) {
    const auth = request.apiTokenAuth;
    if (!auth) {
      throw new CatalogError("unauthorized", 401, "Unauthorized");
    }
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }
    return auth;
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CatalogError) {
        throw catalogHttpException(error);
      }
      throw error;
    }
  }
}

@Controller("v1/orgs/:orgSlug/invites")
@UseGuards(ApiTokenGuard)
export class CatalogInvitesController {
  public constructor(private readonly catalog: CatalogService) {}

  @Get()
  public async list(@Param("orgSlug") orgSlug: string, @Req() request: ApiTokenRequest) {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.listInvites(orgSlug, auth.organizationId);
    });
  }

  @Post()
  @HttpCode(201)
  public async create(
    @Param("orgSlug") orgSlug: string,
    @Body() body: unknown,
    @Req() request: ApiTokenRequest,
  ) {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.createInvite(orgSlug, auth.organizationId, auth.tokenId, body);
    });
  }

  @Delete(":inviteId")
  @HttpCode(204)
  public async remove(
    @Param("orgSlug") orgSlug: string,
    @Param("inviteId") inviteId: string,
    @Req() request: ApiTokenRequest,
  ) {
    return this.handle(() => {
      const auth = this.requireManageAuth(request);
      return this.catalog.deleteInvite(orgSlug, auth.organizationId, inviteId);
    });
  }

  @Post("accept")
  @HttpCode(200)
  public async accept(
    @Param("orgSlug") orgSlug: string,
    @Body() body: unknown,
    @Req() request: ApiTokenRequest,
  ) {
    return this.handle(() => {
      const auth = request.apiTokenAuth;
      if (!auth) {
        throw new CatalogError("unauthorized", 401, "Unauthorized");
      }
      return this.catalog.acceptInviteToken(orgSlug, body);
    });
  }

  private requireManageAuth(request: ApiTokenRequest) {
    const auth = request.apiTokenAuth;
    if (!auth) {
      throw new CatalogError("unauthorized", 401, "Unauthorized");
    }
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }
    return auth;
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CatalogError) {
        throw catalogHttpException(error);
      }
      throw error;
    }
  }
}

