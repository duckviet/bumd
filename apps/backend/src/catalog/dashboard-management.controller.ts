import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { DashboardAuthService } from "../auth/dashboard-auth.service.js";
import { dashboardAuthHttpException } from "../auth/dashboard-auth-errors.js";
import type { DashboardMembershipRole, DashboardPrincipal } from "../auth/dashboard-auth-types.js";
import type { DashboardSessionRequest } from "../auth/dashboard-session-request.js";
import { DashboardSessionGuard } from "../auth/dashboard-session.guard.js";
import { CatalogError, catalogHttpException } from "./catalog-errors.js";
import { CatalogService } from "./catalog.service.js";
import { DashboardDocsService } from "./dashboard-docs.service.js";
import { DashboardApiTokensService } from "./dashboard-api-tokens.service.js";

const ManageRoles: readonly DashboardMembershipRole[] = ["owner", "admin", "member"];

@Controller("v1/dashboard/orgs/:orgSlug")
@UseGuards(DashboardSessionGuard)
export class DashboardManagementController {
  public constructor(
    private readonly auth: DashboardAuthService,
    private readonly catalog: CatalogService,
    private readonly docs: DashboardDocsService,
    private readonly apiTokens: DashboardApiTokensService,
  ) {}

  @Get("api-tokens")
  public async apiTokenList(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireMembership(request, orgSlug); return { apiTokens: await this.apiTokens.list(orgSlug) }; });
  }

  @Post("api-tokens")
  @HttpCode(201)
  public async apiTokenCreate(@Param("orgSlug") orgSlug: string, @Body() body: unknown, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireManager(request, orgSlug); return this.apiTokens.create(orgSlug, body); });
  }

  @Delete("api-tokens/:tokenId")
  @HttpCode(204)
  public async apiTokenRevoke(@Param("orgSlug") orgSlug: string, @Param("tokenId") tokenId: string, @Req() request: DashboardSessionRequest): Promise<void> {
    return this.handle(async () => { await this.requireManager(request, orgSlug); await this.apiTokens.revoke(orgSlug, tokenId); });
  }

  @Get("docs")
  public async listDocs(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireMembership(request, orgSlug); return { docs: await this.docs.list(orgSlug) }; });
  }

  @Post("docs")
  @HttpCode(201)
  public async createDoc(@Param("orgSlug") orgSlug: string, @Body() body: unknown, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireManager(request, orgSlug); return this.docs.create(orgSlug, body); });
  }

  @Get("docs/:docSlug")
  public async getDoc(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireMembership(request, orgSlug); return this.docs.get(orgSlug, docSlug); });
  }

  @Patch("docs/:docSlug")
  public async updateDoc(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string, @Body() body: unknown, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireManager(request, orgSlug); return this.docs.update(orgSlug, docSlug, body); });
  }

  @Delete("docs/:docSlug")
  @HttpCode(204)
  public async deleteDoc(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string, @Req() request: DashboardSessionRequest): Promise<void> {
    return this.handle(async () => { await this.requireManager(request, orgSlug); await this.docs.delete(orgSlug, docSlug); });
  }

  @Get("docs/:docSlug/versions/:versionId")
  public async versionDetail(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string, @Param("versionId") versionId: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireMembership(request, orgSlug); return this.docs.versionDetail(orgSlug, docSlug, versionId); });
  }

  @Get("docs/:docSlug/versions/:versionId/diff")
  public async versionDiff(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string, @Param("versionId") versionId: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireMembership(request, orgSlug); return this.docs.diffDetail(orgSlug, docSlug, versionId); });
  }

  @Get("docs/:docSlug/tests-context")
  public async testsContext(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => { await this.requireMembership(request, orgSlug); return this.docs.testsContext(orgSlug, docSlug); });
  }

  @Get("members")
  public async members(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      await this.requireMembership(request, orgSlug);
      return this.catalog.listMembers(orgSlug, orgSlug);
    });
  }

  @Patch("members/:memberId")
  public async updateMember(@Param("orgSlug") orgSlug: string, @Param("memberId") memberId: string, @Body() body: unknown, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      await this.requireManager(request, orgSlug);
      return this.catalog.updateMemberRole(orgSlug, orgSlug, memberId, body);
    });
  }

  @Delete("members/:memberId")
  @HttpCode(204)
  public async deleteMember(@Param("orgSlug") orgSlug: string, @Param("memberId") memberId: string, @Req() request: DashboardSessionRequest): Promise<void> {
    return this.handle(async () => {
      await this.requireManager(request, orgSlug);
      await this.catalog.deleteMember(orgSlug, orgSlug, memberId);
    });
  }

  @Get("invites")
  public async invites(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      await this.requireMembership(request, orgSlug);
      return this.catalog.listInvites(orgSlug, orgSlug);
    });
  }

  @Post("invites")
  @HttpCode(201)
  public async createInvite(@Param("orgSlug") orgSlug: string, @Body() body: unknown, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      const principal = this.principal(request);
      await this.requireManager(request, orgSlug);
      return this.catalog.createInvite(orgSlug, orgSlug, principal.userId, body);
    });
  }

  @Delete("invites/:inviteId")
  @HttpCode(204)
  public async deleteInvite(@Param("orgSlug") orgSlug: string, @Param("inviteId") inviteId: string, @Req() request: DashboardSessionRequest): Promise<void> {
    return this.handle(async () => {
      await this.requireManager(request, orgSlug);
      await this.catalog.deleteInvite(orgSlug, orgSlug, inviteId);
    });
  }

  @Get("webhooks")
  public async webhooks(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      await this.requireMembership(request, orgSlug);
      return { webhooks: await this.catalog.listWebhooks(orgSlug) };
    });
  }

  @Post("webhooks")
  @HttpCode(201)
  public async createWebhook(@Param("orgSlug") orgSlug: string, @Body() body: unknown, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      await this.requireManager(request, orgSlug);
      return this.catalog.createWebhook(orgSlug, body);
    });
  }

  @Patch("webhooks/:webhookId")
  public async updateWebhook(@Param("orgSlug") orgSlug: string, @Param("webhookId") webhookId: string, @Body() body: unknown, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      await this.requireManager(request, orgSlug);
      return this.catalog.updateWebhook(orgSlug, orgSlug, webhookId, body);
    });
  }

  @Delete("webhooks/:webhookId")
  @HttpCode(204)
  public async deleteWebhook(@Param("orgSlug") orgSlug: string, @Param("webhookId") webhookId: string, @Req() request: DashboardSessionRequest): Promise<void> {
    return this.handle(async () => {
      await this.requireManager(request, orgSlug);
      await this.catalog.deleteWebhook(orgSlug, orgSlug, webhookId);
    });
  }

  @Post("webhooks/:webhookId/rotate-secret")
  public async rotateWebhook(@Param("orgSlug") orgSlug: string, @Param("webhookId") webhookId: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      await this.requireManager(request, orgSlug);
      return this.catalog.rotateWebhookSecret(orgSlug, webhookId);
    });
  }

  @Get("webhooks/:webhookId/deliveries")
  public async deliveries(@Param("orgSlug") orgSlug: string, @Param("webhookId") webhookId: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    return this.handle(async () => {
      await this.requireMembership(request, orgSlug);
      return this.catalog.listWebhookDeliveries(orgSlug, orgSlug, webhookId);
    });
  }

  private principal(request: DashboardSessionRequest): DashboardPrincipal {
    if (request.dashboardPrincipal === undefined) {
      throw dashboardAuthHttpException({ code: "unauthorized", message: "Missing or invalid dashboard session", statusCode: 401 });
    }
    return request.dashboardPrincipal;
  }

  private async requireMembership(request: DashboardSessionRequest, orgSlug: string): Promise<DashboardMembershipRole> {
    const membership = await this.auth.membership(this.principal(request), orgSlug);
    if (membership === null) {
      throw dashboardAuthHttpException({ code: "not_found", message: "Organization not found", statusCode: 404 });
    }
    return membership.role;
  }

  private async requireManager(request: DashboardSessionRequest, orgSlug: string): Promise<void> {
    const role = await this.requireMembership(request, orgSlug);
    if (!ManageRoles.includes(role)) {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }
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
