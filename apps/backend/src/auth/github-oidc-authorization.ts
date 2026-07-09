import type { GithubOidcAuthorization, GithubOidcAuthorizationStore } from "./github-oidc-types.js";

let testingAuthorizations: readonly GithubOidcAuthorization[] | null = null;

export function setGithubOidcAuthorizationsForTesting(authorizations: readonly GithubOidcAuthorization[] | null): void {
  testingAuthorizations = authorizations;
}

export function createGithubOidcAuthorizationStore(): GithubOidcAuthorizationStore {
  return new StaticGithubOidcAuthorizationStore(testingAuthorizations ?? configuredAuthorizations());
}

class StaticGithubOidcAuthorizationStore implements GithubOidcAuthorizationStore {
  public constructor(private readonly authorizations: readonly GithubOidcAuthorization[]) {}

  public async findByOrganizationSlug(organizationSlug: string): Promise<GithubOidcAuthorization | null> {
    return this.authorizations.find((authorization) => authorization.organizationSlug === organizationSlug) ?? null;
  }
}

function configuredAuthorizations(): readonly GithubOidcAuthorization[] {
  const raw = process.env["GITHUB_OIDC_AUTHORIZATIONS"];
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("github_oidc_authorizations_invalid");
  }
  return parsed.map(parseAuthorization);
}

function parseAuthorization(value: unknown): GithubOidcAuthorization {
  if (!isRecord(value)) {
    throw new Error("github_oidc_authorizations_invalid");
  }
  const organizationSlug = stringField(value, "organizationSlug");
  const repositoryOwner = stringField(value, "repositoryOwner");
  const repositories = stringArrayField(value, "repositories");
  const allowedRefs = stringArrayField(value, "allowedRefs");
  if (organizationSlug === null || repositoryOwner === null || repositories === null || allowedRefs === null) {
    throw new Error("github_oidc_authorizations_invalid");
  }
  return { organizationSlug, repositoryOwner, repositories, allowedRefs };
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.trim() !== "" ? field : null;
}

function stringArrayField(value: Record<string, unknown>, key: string): readonly string[] | null {
  const field = value[key];
  if (!Array.isArray(field) || !field.every((item) => typeof item === "string" && item.trim() !== "")) {
    return null;
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
