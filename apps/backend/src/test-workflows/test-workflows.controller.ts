import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import type { ApiTokenRequest } from "../auth/api-token-request.js";
import { TestWorkflowError, testWorkflowHttpException } from "./test-workflow-errors.js";
import { TestWorkflowsService } from "./test-workflows.service.js";

@Controller("v1/orgs/:orgSlug/docs/:docSlug/branches/:branchSlug/test-workflows")
@UseGuards(ApiTokenGuard)
export class TestWorkflowsController {
  public constructor(private readonly service: TestWorkflowsService) {}

  @Get()
  public async list(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.listWorkflows({
        organizationId,
        docId,
        branchId,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
      });
    });
  }

  @Post()
  @HttpCode(201)
  public async create(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Body() body: unknown,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.createWorkflow({
        organizationId,
        docId,
        branchId,
        createdByUserId: auth.tokenId,
        body,
      });
    });
  }

  @Get(":workflowId")
  public async get(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("workflowId") workflowId: string,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.getWorkflow({ organizationId, docId, branchId, workflowId });
    });
  }

  @Patch(":workflowId")
  public async update(
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
      return this.service.updateWorkflow({
        organizationId,
        docId,
        branchId,
        workflowId,
        updatedByUserId: auth.tokenId,
        body,
      });
    });
  }

  @Delete(":workflowId")
  @HttpCode(204)
  public async delete(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("workflowId") workflowId: string,
    @Req() request: ApiTokenRequest,
  ): Promise<void> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      await this.service.deleteWorkflow({ organizationId, docId, branchId, workflowId });
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
    // Re-use the pg pool from service via a direct query using org/doc/branch slugs
    // We delegate slug→id resolution to the service's pool
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
