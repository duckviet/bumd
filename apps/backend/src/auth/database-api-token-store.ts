import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ApiTokenCrypto } from "./api-token-crypto.js";
import type { ApiTokenStore } from "./auth-ports.js";
import { isApiTokenRole, isApiTokenScope, type ApiTokenRecord, type CreateApiTokenInput, type IssuedApiToken } from "./auth-types.js";

type ApiTokenRow = {
  readonly id: string;
  readonly organizationSlug: string;
  readonly name: string;
  readonly tokenHash: string;
  readonly tokenPrefix: string;
  readonly role: string;
  readonly scopes: readonly string[];
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
};

type OrganizationRow = {
  readonly id: string;
};

export class DatabaseApiTokenStore implements ApiTokenStore {
  private readonly pool: Pool;

  public constructor(
    databaseUrl: string,
    private readonly crypto: ApiTokenCrypto,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  public async createApiToken(input: CreateApiTokenInput): Promise<IssuedApiToken> {
    return this.issueApiToken(input);
  }

  public async issueApiToken(input: CreateApiTokenInput): Promise<IssuedApiToken> {
    const organizationId = await this.organizationIdForSlug(input.organizationId);
    const token = this.crypto.generatePlaintext();
    const tokenPrefix = this.crypto.prefix(token);
    const tokenHash = await this.crypto.hash(token);
    const id = `tok_${randomUUID()}`;
    const expiresAt = input.expiresAt === undefined ? null : new Date(input.expiresAt);

    await this.pool.query(
      'INSERT INTO "ApiToken" ("id", "organizationId", "name", "tokenHash", "tokenPrefix", "role", "scopes", "expiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, organizationId, input.name, tokenHash, tokenPrefix, input.role, input.scopes, expiresAt],
    );

    return {
      id,
      token,
      tokenPrefix,
      name: input.name,
      scopes: input.scopes,
    };
  }

  public async findTokenByPrefix(tokenPrefix: string): Promise<ApiTokenRecord | null> {
    const result = await this.pool.query<ApiTokenRow>(
      'SELECT t."id", o."slug" AS "organizationSlug", t."name", t."tokenHash", t."tokenPrefix", t."role", t."scopes", t."lastUsedAt", t."expiresAt", t."revokedAt", t."createdAt" FROM "ApiToken" t JOIN "Organization" o ON o."id" = t."organizationId" WHERE t."tokenPrefix" = $1',
      [tokenPrefix],
    );
    const row = result.rows[0];
    if (row === undefined || !isApiTokenRole(row.role)) {
      return null;
    }
    const scopes = row.scopes.filter(isApiTokenScope);
    return {
      id: row.id,
      organizationId: row.organizationSlug,
      name: row.name,
      tokenHash: row.tokenHash,
      tokenPrefix: row.tokenPrefix,
      role: row.role,
      scopes,
      lastUsedAt: formatDate(row.lastUsedAt),
      expiresAt: formatDate(row.expiresAt),
      revokedAt: formatDate(row.revokedAt),
      createdAt: row.createdAt.toISOString(),
    };
  }

  public async markTokenLastUsed(tokenId: string): Promise<void> {
    await this.pool.query('UPDATE "ApiToken" SET "lastUsedAt" = NOW() WHERE "id" = $1', [tokenId]);
  }

  private async organizationIdForSlug(orgSlug: string): Promise<string> {
    const result = await this.pool.query<OrganizationRow>('SELECT "id" FROM "Organization" WHERE "slug" = $1 OR "id" = $1', [orgSlug]);
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("organization_not_found");
    }
    return row.id;
  }
}

const sharedInMemoryApiTokenStores = new Map<string, ApiTokenStore>();

export function createApiTokenStore(inMemoryStore: ApiTokenStore, crypto: ApiTokenCrypto): ApiTokenStore {
  if (process.env["API_TOKEN_STORE"] === "memory") {
    const storeId = process.env["BUMD_IN_MEMORY_API_TOKEN_STORE_ID"];
    if (!storeId) {
      return inMemoryStore;
    }
    const existing = sharedInMemoryApiTokenStores.get(storeId);
    if (existing) {
      return existing;
    }
    sharedInMemoryApiTokenStores.set(storeId, inMemoryStore);
    return inMemoryStore;
  }
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    return inMemoryStore;
  }
  return new DatabaseApiTokenStore(databaseUrl, crypto);
}

function formatDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
