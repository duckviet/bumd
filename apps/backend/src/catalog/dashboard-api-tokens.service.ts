import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { ApiTokenCrypto } from "../auth/api-token-crypto.js";
import { CatalogError } from "./catalog-errors.js";

const createSchema = z.object({ name: z.string().trim().min(1).max(100), role: z.union([z.literal("owner"), z.literal("admin"), z.literal("member"), z.literal("guest")]), scopes: z.array(z.union([z.literal("docs:deploy"), z.literal("docs:read"), z.literal("docs:test")])).min(1) });
const tokenRowSchema = z.object({ id: z.string(), name: z.string(), tokenPrefix: z.string(), role: z.string(), scopes: z.array(z.string()), lastUsedAt: z.coerce.date().nullable(), expiresAt: z.coerce.date().nullable(), revokedAt: z.coerce.date().nullable(), createdAt: z.coerce.date() });

@Injectable()
export class DashboardApiTokensService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd" });
  public constructor(private readonly crypto: ApiTokenCrypto) {}
  public async onModuleDestroy(): Promise<void> { await this.pool.end(); }

  public async list(orgSlug: string): Promise<readonly unknown[]> {
    const result = await this.pool.query(
      `SELECT t.id, t.name, t."tokenPrefix", t.role::text AS role, t.scopes, t."lastUsedAt", t."expiresAt", t."revokedAt", t."createdAt"
       FROM "ApiToken" t JOIN "Organization" o ON o.id = t."organizationId" WHERE o.slug = $1 AND t."revokedAt" IS NULL ORDER BY t."createdAt" DESC`, [orgSlug],
    );
    return result.rows.map(tokenResponse);
  }

  public async create(orgSlug: string, body: unknown): Promise<unknown> {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new CatalogError("invalid_api_token_request", 400, "Invalid API token request");
    const organizationId = await this.organizationId(orgSlug);
    const plaintext = this.crypto.generatePlaintext();
    const tokenPrefix = this.crypto.prefix(plaintext);
    const tokenHash = await this.crypto.hash(plaintext);
    const id = `tok_${randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO "ApiToken" (id, "organizationId", name, "tokenHash", "tokenPrefix", role, scopes, "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6::"MembershipRole",$7,NOW()) RETURNING id, name, "tokenPrefix", role::text AS role, scopes, "lastUsedAt", "expiresAt", "revokedAt", "createdAt"`,
      [id, organizationId, parsed.data.name, tokenHash, tokenPrefix, parsed.data.role, parsed.data.scopes],
    );
    return { token: plaintext, apiToken: tokenResponse(result.rows[0]) };
  }

  public async revoke(orgSlug: string, tokenId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE "ApiToken" t SET "revokedAt" = NOW() FROM "Organization" o WHERE t."organizationId" = o.id AND o.slug = $1 AND t.id = $2 AND t."revokedAt" IS NULL`, [orgSlug, tokenId],
    );
    if (result.rowCount === 0) throw new CatalogError("api_token_not_found", 404, "API token not found");
  }

  private async organizationId(orgSlug: string): Promise<string> {
    const result = await this.pool.query<{ readonly id: string }>('SELECT id FROM "Organization" WHERE slug = $1', [orgSlug]);
    const row = result.rows[0];
    if (row === undefined) throw new CatalogError("organization_not_found", 404, "Organization not found");
    return row.id;
  }
}

function tokenResponse(value: unknown): unknown {
  const row = tokenRowSchema.parse(value);
  return { id: row.id, name: row.name, tokenPrefix: row.tokenPrefix, role: row.role, scopes: row.scopes, lastUsedAt: row.lastUsedAt?.toISOString() ?? null, expiresAt: row.expiresAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}
