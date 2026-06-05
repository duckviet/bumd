export const ApiTokenScope = {
  DocsDeploy: "docs:deploy",
  DocsRead: "docs:read",
} as const;

export type ApiTokenScope = (typeof ApiTokenScope)[keyof typeof ApiTokenScope];

export const ApiTokenRole = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
  Guest: "guest",
} as const;

export type ApiTokenRole = (typeof ApiTokenRole)[keyof typeof ApiTokenRole];

export function isApiTokenRole(value: string): value is ApiTokenRole {
  return value === ApiTokenRole.Owner || value === ApiTokenRole.Admin || value === ApiTokenRole.Member || value === ApiTokenRole.Guest;
}

export function isApiTokenScope(value: string): value is ApiTokenScope {
  return value === ApiTokenScope.DocsDeploy || value === ApiTokenScope.DocsRead;
}

export type ApiTokenRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly tokenHash: string;
  readonly tokenPrefix: string;
  readonly role: ApiTokenRole;
  readonly scopes: readonly ApiTokenScope[];
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
};

export type IssuedApiToken = {
  readonly id: string;
  readonly token: string;
  readonly tokenPrefix: string;
  readonly name: string;
  readonly scopes: readonly ApiTokenScope[];
};

export type ApiTokenAuthContext = {
  readonly tokenId: string;
  readonly organizationId: string;
  readonly role: ApiTokenRole;
  readonly scopes: readonly ApiTokenScope[];
};

export type CreateApiTokenInput = {
  readonly organizationId: string;
  readonly name: string;
  readonly role: ApiTokenRole;
  readonly scopes: readonly ApiTokenScope[];
  readonly expiresAt?: string;
};
