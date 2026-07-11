import { getDb } from "@/shared/db";
import { randomBytes, randomUUID, argon2Sync } from "node:crypto";

export type DashboardApiToken = {
  readonly id: string;
  readonly name: string;
  readonly tokenPrefix: string;
  readonly role: string;
  readonly scopes: readonly string[];
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
};

const TokenPrefixLength = 16;
const SaltLength = 16;
const TagLength = 32;
const Memory = 19456;
const Passes = 2;
const Parallelism = 2;

function toPhcBase64(value: Buffer): string {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function hashToken(plaintext: string): string {
  const salt = randomBytes(SaltLength);
  const tag = argon2Sync("argon2id", {
    message: plaintext,
    nonce: salt,
    parallelism: Parallelism,
    tagLength: TagLength,
    memory: Memory,
    passes: Passes,
  });
  return `$argon2id$v=19$m=${Memory},t=${Passes},p=${Parallelism}$${toPhcBase64(salt)}$${toPhcBase64(tag)}`;
}

export async function listDashboardApiTokens(organizationSlug: string): Promise<readonly DashboardApiToken[]> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    return [];
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const result = await db.query(
    `SELECT id, name, "tokenPrefix", role::text AS role, scopes, "lastUsedAt", "expiresAt", "revokedAt", "createdAt"
     FROM "ApiToken"
     WHERE "organizationId" = $1 AND "revokedAt" IS NULL
     ORDER BY "createdAt" DESC`,
    [orgId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    role: row.role,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt ? (row.lastUsedAt as Date).toISOString() : null,
    expiresAt: row.expiresAt ? (row.expiresAt as Date).toISOString() : null,
    revokedAt: row.revokedAt ? (row.revokedAt as Date).toISOString() : null,
    createdAt: (row.createdAt as Date).toISOString(),
  }));
}

export async function createDashboardApiToken(
  organizationSlug: string,
  name: string,
  role: string,
  scopes: string[]
): Promise<{ readonly token: string; readonly apiToken: DashboardApiToken }> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const plaintext = `bumd_live_${randomBytes(32).toString("base64url")}`;
  const prefix = plaintext.slice(0, TokenPrefixLength);
  const hash = hashToken(plaintext);
  const id = `tok_${randomUUID()}`;

  await db.query(
    `INSERT INTO "ApiToken" (id, "organizationId", name, "tokenHash", "tokenPrefix", role, scopes, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6::"MembershipRole", $7, NOW())`,
    [id, orgId, name, hash, prefix, role, scopes]
  );

  const apiToken: DashboardApiToken = {
    id,
    name,
    tokenPrefix: prefix,
    role,
    scopes,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  };

  return { token: plaintext, apiToken };
}

export async function revokeDashboardApiToken(organizationSlug: string, tokenId: string): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  await db.query(
    `UPDATE "ApiToken"
     SET "revokedAt" = NOW()
     WHERE id = $1 AND "organizationId" = $2`,
    [tokenId, orgId]
  );
}
