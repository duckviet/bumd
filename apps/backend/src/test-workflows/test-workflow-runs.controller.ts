import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { DashboardOrApiTokenGuard } from "../auth/dashboard-or-api-token.guard.js";
import type { ApiTokenRequest } from "../auth/api-token-request.js";
import { TestWorkflowError, testWorkflowHttpException } from "./test-workflow-errors.js";
import { TestWorkflowRunsService } from "./test-workflow-runs.service.js";

@Controller("v1/orgs/:orgSlug/docs/:docSlug/branches/:branchSlug/test-workflows/:workflowId/runs")
@UseGuards(DashboardOrApiTokenGuard)
export class TestWorkflowRunsController {
  public constructor(private readonly service: TestWorkflowRunsService) {}

  @Post()
  @HttpCode(202)
  public async create(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("workflowId") workflowId: string,
    @Body() body: unknown,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.createRun({
        organizationId,
        docId,
        branchId,
        orgSlug,
        docSlug,
        branchSlug,
        workflowId,
        startedByUserId: null,
        startedByTokenId: auth.tokenId,
        body,
      });
    });
  }

  @Get()
  public async list(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("workflowId") workflowId: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.listRuns({
        organizationId,
        docId,
        branchId,
        workflowId,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
    });
  }

  @Get(":runId")
  public async get(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("workflowId") workflowId: string,
    @Param("runId") runId: string,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.getRun({ organizationId, docId, branchId, workflowId, runId });
    });
  }

  @Post(":runId/cancel")
  @HttpCode(202)
  public async cancel(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("workflowId") workflowId: string,
    @Param("runId") runId: string,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.cancelRun({ organizationId, docId, branchId, workflowId, runId });
    });
  }

  private requireAuth(request: ApiTokenRequest) {
    const auth = request.apiTokenAuth;
    if (!auth) {
      throw new TestWorkflowError("UNAUTHORIZED", 401, "Unauthorized");
    }
    return auth;
  }

  private async resolveScope(
    orgSlug: string,
    docSlug: string,
    branchSlug: string,
    organizationId: string,
  ): Promise<{ organizationId: string; docId: string; branchId: string }> {
    const pool = (this.service as unknown as { db: () => import("pg").Pool }).db();
    const result = await pool.query<{ orgId: string; docId: string; branchId: string }>(
      `SELECT o.id AS "orgId", d.id AS "docId", b.id AS "branchId"
       FROM "Organization" o
       JOIN "Doc" d ON d."organizationId" = o.id AND d.slug = $2
       JOIN "Branch" b ON b."docId" = d.id AND b.slug = $3
       WHERE (o.id = $1 OR o.slug = $1)`,
      [organizationId, docSlug, branchSlug],
    );
    const row = result.rows[0];
    if (!row) {
      throw new TestWorkflowError("NOT_FOUND", 404, "Doc or branch not found");
    }
    return { organizationId: row.orgId, docId: row.docId, branchId: row.branchId };
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof TestWorkflowError) {
        throw testWorkflowHttpException(error);
      }
      throw error;
    }
  }
}
