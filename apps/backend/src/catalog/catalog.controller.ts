import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
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

@Controller("v1/orgs/:orgSlug/webhooks")
@UseGuards(ApiTokenGuard)
export class CatalogWebhooksController {
  public constructor(private readonly catalog: CatalogService) {}

  @Get()
  public async list(@Param("orgSlug") orgSlug: string): Promise<unknown> {
    return this.handle(() => this.catalog.listWebhooks(orgSlug));
  }

  @Post()
  public async create(@Param("orgSlug") orgSlug: string, @Body() body: unknown): Promise<unknown> {
    return this.handle(() => this.catalog.createWebhook(orgSlug, body));
  }

  @Post(":webhookId/rotate-secret")
  @HttpCode(200)
  public async rotateSecret(
    @Param("orgSlug") orgSlug: string,
    @Param("webhookId") webhookId: string,
  ): Promise<unknown> {
    return this.handle(() => this.catalog.rotateWebhookSecret(orgSlug, webhookId));
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
