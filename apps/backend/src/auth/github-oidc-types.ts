export const GITHUB_OIDC_VERIFIER = Symbol("GITHUB_OIDC_VERIFIER");
export const GITHUB_OIDC_AUTHORIZATION_STORE = Symbol("GITHUB_OIDC_AUTHORIZATION_STORE");

export type GithubOidcClaims = {
  readonly iss: string;
  readonly aud: string | readonly string[];
  readonly sub: string;
  readonly repository: string;
  readonly repository_owner?: string;
  readonly ref?: string;
  readonly exp: number;
  readonly iat: number;
  readonly nbf?: number;
};

export type GithubOidcVerifier = {
  readonly verify: (token: string) => Promise<GithubOidcClaims>;
};

export type GithubOidcExchangeInput = {
  readonly token: string;
  readonly organizationSlug: string;
  readonly repository: string;
  readonly ref?: string;
};

export type GithubOidcAuthorization = {
  readonly organizationSlug: string;
  readonly repositoryOwner: string;
  readonly repositories: readonly string[];
  readonly allowedRefs: readonly string[];
};

export type GithubOidcAuthorizationStore = {
  readonly findByOrganizationSlug: (organizationSlug: string) => Promise<GithubOidcAuthorization | null>;
};
