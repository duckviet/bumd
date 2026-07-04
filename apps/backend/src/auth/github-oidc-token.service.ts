import { Inject, Injectable } from "@nestjs/common";
import { API_TOKEN_STORE, type ApiTokenStore } from "./auth-ports.js";
import { ApiTokenRole, ApiTokenScope, type IssuedApiToken } from "./auth-types.js";
import {
  GITHUB_OIDC_AUTHORIZATION_STORE,
  GITHUB_OIDC_VERIFIER,
  type GithubOidcAuthorizationStore,
  type GithubOidcClaims,
  type GithubOidcExchangeInput,
  type GithubOidcVerifier,
} from "./github-oidc-types.js";

const GithubIssuer = "https://token.actions.githubusercontent.com";
const DefaultAudience = "bumd";

export class GithubOidcExchangeError extends Error {
  public constructor(
    public readonly code: "unauthorized" | "forbidden",
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class GithubOidcTokenService {
  public constructor(
    @Inject(GITHUB_OIDC_VERIFIER) private readonly verifier: GithubOidcVerifier,
    @Inject(GITHUB_OIDC_AUTHORIZATION_STORE) private readonly authorizationStore: GithubOidcAuthorizationStore,
    @Inject(API_TOKEN_STORE) private readonly store: ApiTokenStore,
  ) {}

  public async exchange(input: GithubOidcExchangeInput): Promise<IssuedApiToken> {
    const claims = await this.verify(input.token);
    const authorization = await this.authorizationStore.findByOrganizationSlug(input.organizationSlug);
    if (authorization === null) {
      throw new GithubOidcExchangeError("forbidden", "Organization is not authorized for GitHub OIDC exchange");
    }
    this.validateClaims(claims, input, authorization);
    try {
      return await this.store.createApiToken({
        organizationId: input.organizationSlug,
        name: `github-actions:${input.repository}`,
        role: ApiTokenRole.Member,
        scopes: [ApiTokenScope.DocsDeploy],
      });
    } catch (error) {
      if (error instanceof Error && error.message === "organization_not_found") {
        throw new GithubOidcExchangeError("forbidden", "Organization is not authorized for GitHub OIDC exchange");
      }
      throw error;
    }
  }

  private async verify(token: string): Promise<GithubOidcClaims> {
    try {
      return await this.verifier.verify(token);
    } catch {
      throw new GithubOidcExchangeError("unauthorized", "GitHub OIDC token is invalid");
    }
  }

  private validateClaims(
    claims: GithubOidcClaims,
    input: GithubOidcExchangeInput,
    authorization: Awaited<ReturnType<GithubOidcAuthorizationStore["findByOrganizationSlug"]>>,
  ): void {
    if (claims.iss !== GithubIssuer || !audienceMatches(claims.aud)) {
      throw new GithubOidcExchangeError("unauthorized", "GitHub OIDC token is invalid");
    }
    if (authorization === null) {
      throw new GithubOidcExchangeError("forbidden", "Organization is not authorized for GitHub OIDC exchange");
    }
    if (
      claims.repository_owner !== authorization.repositoryOwner ||
      claims.repository !== input.repository ||
      !authorization.repositories.includes(claims.repository)
    ) {
      throw new GithubOidcExchangeError("forbidden", "GitHub OIDC repository is not authorized");
    }
    const ref = input.ref ?? claims.ref;
    if (ref === undefined || !authorization.allowedRefs.includes(ref)) {
      throw new GithubOidcExchangeError("forbidden", "GitHub OIDC ref is not authorized");
    }
    if (claims.sub !== `repo:${input.repository}:ref:${ref}` || claims.ref !== ref) {
      throw new GithubOidcExchangeError("forbidden", "GitHub OIDC subject is not authorized");
    }
  }
}

function audienceMatches(audience: string | readonly string[]): boolean {
  const expectedAudience = process.env["GITHUB_OIDC_AUDIENCE"] ?? DefaultAudience;
  return Array.isArray(audience) ? audience.includes(expectedAudience) : audience === expectedAudience;
}
