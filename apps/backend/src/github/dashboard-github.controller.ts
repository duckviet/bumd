import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { DashboardAuthService } from "../auth/dashboard-auth.service.js";
import { dashboardAuthHttpException } from "../auth/dashboard-auth-errors.js";
import type { DashboardSessionRequest } from "../auth/dashboard-session-request.js";
import { DashboardSessionGuard } from "../auth/dashboard-session.guard.js";
import { GithubService } from "./github.service.js";
import { GITHUB_QUEUE, type GithubQueue } from "./github-queue.js";

const repoSchema = z.object({ githubInstallationId: z.string().min(1), githubRepoId: z.string().min(1), fullName: z.string().min(1) });
const assignmentSchema = z.object({ docId: z.string().nullable() });
const mappingSchema = z.object({ docId: z.string().min(1), branchName: z.string().min(1), specPath: z.string().min(1) });
const installationSchema = z.object({ githubInstallationId: z.string().min(1), accountName: z.string().min(1) });
const simulationSchema = z.object({ mappingId: z.string().min(1) });

@Controller("v1/dashboard/orgs/:orgSlug/github")
@UseGuards(DashboardSessionGuard)
export class DashboardGithubController {
  public constructor(private readonly auth: DashboardAuthService, private readonly github: GithubService, @Inject(GITHUB_QUEUE) private readonly queue: GithubQueue) {}

  @Get("installations")
  public async installations(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    await this.authorize(request, orgSlug, false); return { installations: await this.github.listInstallations(orgSlug) };
  }

  @Post("installations")
  @HttpCode(201)
  public async upsertInstallation(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest, @Body() body: unknown): Promise<unknown> {
    await this.authorize(request, orgSlug, true); const input = parse(body, installationSchema); return this.github.upsertInstallationForOrg(orgSlug, input.githubInstallationId, input.accountName);
  }

  @Get("repositories")
  public async repositories(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    await this.authorize(request, orgSlug, false); return { repositories: await this.github.listRepositories(orgSlug) };
  }

  @Post("repositories")
  @HttpCode(201)
  public async createRepository(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest, @Body() body: unknown): Promise<unknown> {
    await this.authorize(request, orgSlug, true); return this.github.linkRepository(orgSlug, parse(body, repoSchema));
  }

  @Patch("repositories/:repoId")
  @HttpCode(204)
  public async assignRepository(@Param("orgSlug") orgSlug: string, @Param("repoId") repoId: string, @Req() request: DashboardSessionRequest, @Body() body: unknown): Promise<void> {
    await this.authorize(request, orgSlug, true); await this.github.assignRepository(orgSlug, repoId, parse(body, assignmentSchema).docId);
  }

  @Delete("repositories/:repoId")
  @HttpCode(204)
  public async deleteRepository(@Param("orgSlug") orgSlug: string, @Param("repoId") repoId: string, @Req() request: DashboardSessionRequest): Promise<void> {
    await this.authorize(request, orgSlug, true); await this.github.unlinkRepository(orgSlug, repoId);
  }

  @Get("docs/:docId/mappings")
  public async mappings(@Param("orgSlug") orgSlug: string, @Param("docId") docId: string, @Req() request: DashboardSessionRequest): Promise<unknown> {
    await this.authorize(request, orgSlug, false); return { mappings: await this.github.listMappingsForDoc(orgSlug, docId) };
  }

  @Post("repositories/:githubRepoId/mappings")
  @HttpCode(201)
  public async createMapping(@Param("orgSlug") orgSlug: string, @Param("githubRepoId") githubRepoId: string, @Req() request: DashboardSessionRequest, @Body() body: unknown): Promise<unknown> {
    await this.authorize(request, orgSlug, true); return this.github.createMapping(orgSlug, githubRepoId, parse(body, mappingSchema));
  }

  @Delete("mappings/:mappingId")
  @HttpCode(204)
  public async deleteMapping(@Param("orgSlug") orgSlug: string, @Param("mappingId") mappingId: string, @Req() request: DashboardSessionRequest): Promise<void> {
    await this.authorize(request, orgSlug, true); await this.github.deleteMapping(orgSlug, mappingId);
  }

  @Post("simulations/push")
  @HttpCode(202)
  public async simulatePush(@Param("orgSlug") orgSlug: string, @Req() request: DashboardSessionRequest, @Body() body: unknown): Promise<unknown> {
    await this.authorize(request, orgSlug, true);
    if (process.env["NODE_ENV"] === "production") throw dashboardAuthHttpException({ code: "not_found", message: "Not found", statusCode: 404 });
    const payload = await this.github.simulatedPush(orgSlug, parse(body, simulationSchema).mappingId);
    if (payload === null) throw dashboardAuthHttpException({ code: "not_found", message: "Mapping not found", statusCode: 404 });
    await this.queue.enqueue({ type: "push", payload });
    return { accepted: true };
  }

  private async authorize(request: DashboardSessionRequest, orgSlug: string, manage: boolean): Promise<void> {
    const principal = request.dashboardPrincipal;
    if (principal === undefined) throw dashboardAuthHttpException({ code: "unauthorized", message: "Missing or invalid dashboard session", statusCode: 401 });
    const membership = await this.auth.membership(principal, orgSlug);
    if (membership === null) throw dashboardAuthHttpException({ code: "not_found", message: "Organization not found", statusCode: 404 });
    if (manage && membership.role === "guest") throw dashboardAuthHttpException({ code: "not_found", message: "Organization not found", statusCode: 404 });
  }
}

function parse<T>(body: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(body);
  if (!result.success) throw dashboardAuthHttpException({ code: "validation_failed", message: "GitHub request is malformed", statusCode: 400 });
  return result.data;
}
