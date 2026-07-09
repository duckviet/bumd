import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { z } from "zod";
import { ApiTokenRole, ApiTokenScope, type IssuedApiToken } from "./auth-types.js";
import { API_TOKEN_STORE, type ApiTokenStore } from "./auth-ports.js";
import type { GithubOAuthEmail, GithubOAuthExchangeInput, GithubOAuthUser } from "./github-oauth-types.js";

const githubUserSchema = z.object({
  id: z.union([z.string(), z.number()]),
  login: z.string().min(1),
  email: z.string().email().nullable().optional(),
});

const githubEmailSchema = z.object({
  email: z.string().email(),
  primary: z.boolean(),
  verified: z.boolean(),
});

type LinkedUser = {
  readonly id: string;
  readonly email: string;
  readonly githubId: string | null;
};

export class GithubOAuthExchangeError extends Error {
  public constructor(
    public readonly code: "unauthorized" | "forbidden",
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class GithubOAuthService {
  private readonly pool: Pool;

  public constructor(@Inject(API_TOKEN_STORE) private readonly tokenStore: ApiTokenStore) {
    const databaseUrl = process.env["DATABASE_URL"];
    if (databaseUrl === undefined || databaseUrl.trim() === "") {
      throw new Error("DATABASE_URL is required for GitHub OAuth exchange");
    }
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  public async exchange(input: GithubOAuthExchangeInput): Promise<IssuedApiToken> {
    const githubUser = await this.fetchGithubUser(input.githubAccessToken);
    const email = await this.primaryVerifiedEmail(input.githubAccessToken, githubUser);
    const user = await this.findOrganizationUser({
      organizationSlug: input.organizationSlug,
      githubId: githubUser.id,
      email,
    });
    if (user === null) {
      throw new GithubOAuthExchangeError("forbidden", "GitHub user is not a member of the requested organization");
    }
    if (user.githubId !== null && user.githubId !== githubUser.id) {
      throw new GithubOAuthExchangeError("forbidden", "GitHub identity is already linked to another user");
    }
    if (user.githubId === null) {
      await this.pool.query('UPDATE "User" SET "githubId" = $1, "githubLogin" = $2 WHERE "id" = $3', [
        githubUser.id,
        githubUser.login,
        user.id,
      ]);
    }
    return this.tokenStore.createApiToken({
      organizationId: input.organizationSlug,
      name: `github-oauth:${githubUser.login}`,
      role: ApiTokenRole.Member,
      scopes: [ApiTokenScope.DocsDeploy],
    });
  }

  private async fetchGithubUser(accessToken: string): Promise<GithubOAuthUser> {
    const response = await fetch(githubApiUrl("/user"), {
      headers: githubHeaders(accessToken),
    });
    if (!response.ok) {
      throw new GithubOAuthExchangeError("unauthorized", "GitHub access token is invalid");
    }
    const raw: unknown = await response.json();
    const parsed = githubUserSchema.safeParse(raw);
    if (!parsed.success) {
      throw new GithubOAuthExchangeError("unauthorized", "GitHub user response is invalid");
    }
    return {
      id: String(parsed.data.id),
      login: parsed.data.login,
      email: parsed.data.email ?? null,
    };
  }

  private async primaryVerifiedEmail(accessToken: string, user: GithubOAuthUser): Promise<string> {
    if (user.email !== null) {
      return user.email.toLowerCase();
    }
    const response = await fetch(githubApiUrl("/user/emails"), {
      headers: githubHeaders(accessToken),
    });
    if (!response.ok) {
      throw new GithubOAuthExchangeError("unauthorized", "GitHub email response is invalid");
    }
    const raw: unknown = await response.json();
    const parsed = z.array(githubEmailSchema).safeParse(raw);
    if (!parsed.success) {
      throw new GithubOAuthExchangeError("unauthorized", "GitHub email response is invalid");
    }
    const primary = parsed.data.find((email) => email.primary && email.verified);
    if (primary === undefined) {
      throw new GithubOAuthExchangeError("forbidden", "GitHub account has no verified primary email");
    }
    return primary.email.toLowerCase();
  }

  private async findOrganizationUser(input: {
    readonly organizationSlug: string;
    readonly githubId: string;
    readonly email: string;
  }): Promise<LinkedUser | null> {
    const result = await this.pool.query(
      `SELECT u."id", u."email", u."githubId"
       FROM "User" u
       JOIN "Membership" m ON m."userId" = u."id"
       JOIN "Organization" o ON o."id" = m."organizationId"
       WHERE o."slug" = $1
         AND (u."githubId" = $2 OR lower(u."email") = $3)
       LIMIT 1`,
      [input.organizationSlug, input.githubId, input.email],
    );
    const row: unknown = result.rows[0];
    const parsed = z
      .object({
        id: z.string(),
        email: z.string(),
        githubId: z.string().nullable(),
      })
      .safeParse(row);
    return parsed.success ? parsed.data : null;
  }
}

function githubApiUrl(path: string): string {
  return new URL(path, process.env["GITHUB_API_URL"] ?? "https://api.github.com").toString();
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}
