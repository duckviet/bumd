import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { DashboardAuthService } from "./dashboard-auth.service.js";
import { dashboardAuthHttpException } from "./dashboard-auth-errors.js";
import { DashboardSessionGuard } from "./dashboard-session.guard.js";
import type { DashboardSessionRequest } from "./dashboard-session-request.js";
import type { DashboardPrincipal } from "./dashboard-auth-types.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(512),
});
const registrationSchema = credentialsSchema.extend({ name: z.string().trim().min(1).max(200) });
const refreshSchema = z.object({ refreshCredential: z.string().min(1) });
const inviteSchema = z.object({ token: z.string().min(1).max(1024) });
const githubSchema = z.object({ githubAccessToken: z.string().min(1) });

@Controller("v1/dashboard")
export class DashboardAuthController {
  public constructor(private readonly dashboardAuth: DashboardAuthService) {}

  @Post("auth/register")
  @HttpCode(201)
  public async register(@Body() body: unknown): Promise<unknown> {
    const bundle = await this.dashboardAuth.register(parseRegistration(body));
    if (bundle === null) {
      throw dashboardAuthHttpException({ code: "duplicate_resource", message: "An account with this email already exists", statusCode: 409 });
    }
    return bundle;
  }

  @Post("auth/login")
  @HttpCode(201)
  public async login(@Body() body: unknown): Promise<unknown> {
    const bundle = await this.dashboardAuth.login(parseCredentials(body));
    if (bundle === null) {
      throw dashboardAuthHttpException({ code: "unauthorized", message: "Invalid email or password", statusCode: 401 });
    }
    return bundle;
  }

  @Post("auth/github")
  @HttpCode(201)
  public async github(@Body() body: unknown): Promise<unknown> {
    const bundle = await this.dashboardAuth.loginWithGithub(parseGithub(body));
    if (bundle === null) {
      throw dashboardAuthHttpException({ code: "unauthorized", message: "GitHub identity could not be verified", statusCode: 401 });
    }
    return bundle;
  }

  @Post("auth/refresh")
  @HttpCode(201)
  public async refresh(@Body() body: unknown): Promise<unknown> {
    const bundle = await this.dashboardAuth.refresh(parseRefresh(body));
    if (bundle === null) {
      throw dashboardAuthHttpException({ code: "unauthorized", message: "Invalid refresh credential", statusCode: 401 });
    }
    return bundle;
  }

  @Post("auth/logout")
  @UseGuards(DashboardSessionGuard)
  @HttpCode(204)
  public async logout(@Req() request: DashboardSessionRequest): Promise<void> {
    await this.dashboardAuth.revoke(principalFrom(request));
  }

  @Get("me")
  @UseGuards(DashboardSessionGuard)
  public async me(@Req() request: DashboardSessionRequest): Promise<unknown> {
    const user = await this.dashboardAuth.currentUser(principalFrom(request));
    if (user === null) {
      throw dashboardAuthHttpException({ code: "unauthorized", message: "Missing or invalid dashboard session", statusCode: 401 });
    }
    return user;
  }

  @Get("orgs/:organizationSlug/membership")
  @UseGuards(DashboardSessionGuard)
  public async membership(@Req() request: DashboardSessionRequest, @Param("organizationSlug") organizationSlug: string): Promise<unknown> {
    const membership = await this.dashboardAuth.membership(principalFrom(request), organizationSlug);
    if (membership === null) {
      throw dashboardAuthHttpException({ code: "not_found", message: "Organization not found", statusCode: 404 });
    }
    return membership;
  }

  @Post("invites/accept")
  @UseGuards(DashboardSessionGuard)
  @HttpCode(200)
  public async acceptInvite(@Req() request: DashboardSessionRequest, @Body() body: unknown): Promise<unknown> {
    const accepted = await this.dashboardAuth.acceptInvite(principalFrom(request), parseInvite(body));
    if (accepted === null) {
      throw dashboardAuthHttpException({ code: "invalid_invite", message: "Invite is invalid or expired", statusCode: 400 });
    }
    return accepted;
  }
}

function parseRegistration(body: unknown): z.infer<typeof registrationSchema> {
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    throw dashboardAuthHttpException({ code: "validation_failed", message: "Registration request is malformed", statusCode: 400 });
  }
  return parsed.data;
}

function parseCredentials(body: unknown): z.infer<typeof credentialsSchema> {
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    throw dashboardAuthHttpException({ code: "validation_failed", message: "Login request is malformed", statusCode: 400 });
  }
  return parsed.data;
}

function parseRefresh(body: unknown): string {
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    throw dashboardAuthHttpException({ code: "validation_failed", message: "Refresh request is malformed", statusCode: 400 });
  }
  return parsed.data.refreshCredential;
}

function parseInvite(body: unknown): string {
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    throw dashboardAuthHttpException({ code: "validation_failed", message: "Invite request is malformed", statusCode: 400 });
  }
  return parsed.data.token;
}

function parseGithub(body: unknown): string {
  const parsed = githubSchema.safeParse(body);
  if (!parsed.success) {
    throw dashboardAuthHttpException({ code: "validation_failed", message: "GitHub login request is malformed", statusCode: 400 });
  }
  return parsed.data.githubAccessToken;
}

function principalFrom(request: DashboardSessionRequest): DashboardPrincipal {
  const principal = request.dashboardPrincipal;
  if (principal === undefined) {
    throw dashboardAuthHttpException({ code: "unauthorized", message: "Missing or invalid dashboard session", statusCode: 401 });
  }
  return principal;
}
