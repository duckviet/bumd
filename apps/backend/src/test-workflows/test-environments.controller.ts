import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import type { ApiTokenRequest } from "../auth/api-token-request.js";
import { TestWorkflowError, testWorkflowHttpException } from "./test-workflow-errors.js";
import { TestEnvironmentsService } from "./test-environments.service.js";

@Controller("v1/orgs/:orgSlug/docs/:docSlug/branches/:branchSlug/test-environments")
@UseGuards(ApiTokenGuard)
export class TestEnvironmentsController {
  public constructor(private readonly service: TestEnvironmentsService) {}

  @Get()
  public async list(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.listEnvironments({ organizationId, docId, branchId });
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
      this.requireAdminOrOwner(auth);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.createEnvironment({ organizationId, docId, branchId, body });
    });
  }

  @Patch(":environmentId")
  public async update(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("environmentId") environmentId: string,
    @Body() body: unknown,
    @Req() request: ApiTokenRequest,
  ): Promise<unknown> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      this.requireAdminOrOwner(auth);
      const { organizationId, docId, branchId } = await this.resolveScope(orgSlug, docSlug, branchSlug, auth.organizationId);
      return this.service.updateEnvironment({ organizationId, docId, branchId, environmentId, body });
    });
  }

  @Delete(":environmentId")
  @HttpCode(204)
  public async delete(
    @Param("orgSlug") orgSlug: string,
    @Param("docSlug") docSlug: string,
    @Param("branchSlug") branchSlug: string,
    @Param("environmentId") environmentId: string,
    @Req() request: ApiTokenRequest,
  ): Promise<void> {
    return this.handle(async () => {
      const auth = this.requireAuth(request);
      this.requireAdminOrOwner(auth);
      await this.service.deleteEnvironment({ organizationId: auth.organizationId, environmentId });
    });
  }

  private requireAuth(request: ApiTokenRequest) {
    const auth = request.apiTokenAuth;
    if (!auth) {
      throw new TestWorkflowError("UNAUTHORIZED", 401, "Unauthorized");
    }
    return auth;
  }

  private requireAdminOrOwner(auth: NonNullable<ApiTokenRequest["apiTokenAuth"]>): void {
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new TestWorkflowError("FORBIDDEN", 403, "Managing environments requires admin or owner role");
    }
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
       WHERE o.id = $1`,
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
