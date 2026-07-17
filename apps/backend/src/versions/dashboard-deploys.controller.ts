import { Body, Controller, HttpException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { DashboardAuthService } from "../auth/dashboard-auth.service.js";
import { dashboardAuthHttpException } from "../auth/dashboard-auth-errors.js";
import type { DashboardSessionRequest } from "../auth/dashboard-session-request.js";
import { DashboardSessionGuard } from "../auth/dashboard-session.guard.js";
import { ApiTokenScope } from "../auth/auth-types.js";
import { DeployError, requestId } from "./deploy-errors.js";
import { VersionsService } from "./versions.service.js";

@Controller("v1/dashboard/orgs/:orgSlug/docs/:docSlug/branches/:branchSlug/deploys")
@UseGuards(DashboardSessionGuard)
export class DashboardDeploysController {
  public constructor(private readonly auth: DashboardAuthService, private readonly versions: VersionsService) {}

  @Post()
  public async create(@Param("orgSlug") orgSlug: string, @Param("docSlug") docSlug: string, @Param("branchSlug") branchSlug: string, @Body() body: unknown, @Req() request: DashboardSessionRequest): Promise<unknown> {
    const principal = request.dashboardPrincipal;
    if (principal === undefined) throw dashboardAuthHttpException({ code: "unauthorized", message: "Missing or invalid dashboard session", statusCode: 401 });
    const membership = await this.auth.membership(principal, orgSlug);
    if (membership === null) throw dashboardAuthHttpException({ code: "not_found", message: "Organization not found", statusCode: 404 });
    if (membership.role === "guest") throw dashboardAuthHttpException({ code: "not_found", message: "Organization not found", statusCode: 404 });
    try {
      return await this.versions.deploy(
        { ...objectBody(body), orgSlug, docSlug, branchSlug },
        {
          tokenId: principal.sessionId,
          userId: principal.userId,
          organizationId: orgSlug,
          role: membership.role,
          scopes: [ApiTokenScope.DocsDeploy],
        },
      );
    } catch (error) {
      if (error instanceof DeployError) throw new HttpException({ error: { code: error.code, message: error.message, requestId: requestId(), details: {} } }, error.statusCode);
      throw error;
    }
  }
}
function objectBody(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : {}; }
