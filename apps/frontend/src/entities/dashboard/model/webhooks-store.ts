import { getDb } from "@/shared/db";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getMasterKey(): Buffer {
  const secret = process.env["WEBHOOK_SECRETS_KEY"] || process.env["AUTH_SECRET"] || "test_webhook_secrets_key_not_sec_";
  return Buffer.alloc(32, secret, "utf8");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted}`;
}

export function decryptSecret(secretRef: string): string | null {
  if (secretRef.startsWith("env:")) {
    const envName = secretRef.slice("env:".length);
    const value = process.env[envName];
    return value === undefined || value === "" ? null : value;
  }

  if (!secretRef.startsWith("enc:")) {
    return secretRef;
  }

  try {
    const parts = secretRef.slice("enc:".length).split(":");
    if (parts.length !== 3) {
      return null;
    }
    const ivBase64 = parts[0];
    const tagBase64 = parts[1];
    const ciphertextBase64 = parts[2];
    if (ivBase64 === undefined || tagBase64 === undefined || ciphertextBase64 === undefined) {
      return null;
    }
    const iv = Buffer.from(ivBase64, "base64");
    const tag = Buffer.from(tagBase64, "base64");
    const decipher = createDecipheriv(ALGORITHM, getMasterKey(), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertextBase64, "base64", "utf8") as string;
    decrypted += decipher.final("utf8") as string;
    return decrypted;
  } catch (error) {
    return null;
  }
}

export type DashboardWebhook = {
  readonly id: string;
  readonly url: string;
  readonly description: string | null;
  readonly enabled: boolean;
  readonly eventTypes: readonly string[];
  readonly createdAt: string;
};

export type DashboardWebhookDelivery = {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly statusCode: number | null;
  readonly success: boolean;
  readonly lastError: string | null;
  readonly createdAt: string;
};

export async function listDashboardWebhooks(organizationSlug: string): Promise<readonly DashboardWebhook[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT w.id, w.url, w.description, w.enabled, w."eventTypes", w."createdAt"
     FROM "Webhook" w
     INNER JOIN "Organization" o ON o.id = w."organizationId"
     WHERE o.slug = $1
     ORDER BY w."createdAt" DESC`,
    [organizationSlug]
  );
  return result.rows.map((row) => ({
    id: row.id,
    url: row.url,
    description: row.description,
    enabled: row.enabled,
    eventTypes: row.eventTypes,
    createdAt: (row.createdAt as Date).toISOString(),
  }));
}

export async function createDashboardWebhook(
  organizationSlug: string,
  url: string,
  description: string | null,
  eventTypes: string[]
): Promise<{ readonly id: string; readonly secret: string; readonly webhook: DashboardWebhook }> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const secret = `bumd_sec_${randomBytes(24).toString("hex")}`;
  const secretRef = encryptSecret(secret);
  const id = `wh_${randomUUID()}`;

  await db.query(
    `INSERT INTO "Webhook" (id, "organizationId", url, description, "secretRef", enabled, "eventTypes", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), NOW())`,
    [id, orgId, url, description || null, secretRef, eventTypes]
  );

  const webhook: DashboardWebhook = {
    id,
    url,
    description: description || null,
    enabled: true,
    eventTypes,
    createdAt: new Date().toISOString(),
  };

  return { id, secret, webhook };
}

export async function updateDashboardWebhook(
  organizationSlug: string,
  webhookId: string,
  data: {
    readonly url: string;
    readonly enabled: boolean;
    readonly eventTypes: string[];
  }
): Promise<DashboardWebhook> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const result = await db.query(
    `UPDATE "Webhook"
     SET url = $1, enabled = $2, "eventTypes" = $3, "updatedAt" = NOW()
     WHERE id = $4 AND "organizationId" = $5
     RETURNING id, url, description, enabled, "eventTypes", "createdAt"`,
    [data.url, data.enabled, data.eventTypes, webhookId, orgId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Webhook not found");
  }

  return {
    id: row.id,
    url: row.url,
    description: row.description,
    enabled: row.enabled,
    eventTypes: row.eventTypes,
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

export async function deleteDashboardWebhook(organizationSlug: string, webhookId: string): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  await db.query(
    `DELETE FROM "Webhook"
     WHERE id = $1 AND "organizationId" = $2`,
    [webhookId, orgId]
  );
}

export async function rotateDashboardWebhookSecret(
  organizationSlug: string,
  webhookId: string
): Promise<{ readonly secret: string }> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const secret = `bumd_sec_${randomBytes(24).toString("hex")}`;
  const secretRef = encryptSecret(secret);

  const res = await db.query(
    `UPDATE "Webhook"
     SET "secretRef" = $1, "updatedAt" = NOW()
     WHERE id = $2 AND "organizationId" = $3
     RETURNING id`,
    [secretRef, webhookId, orgId]
  );

  if (res.rows.length === 0) {
    throw new Error("Webhook not found");
  }

  return { secret };
}

export async function listDashboardWebhookDeliveries(
  organizationSlug: string,
  webhookId: string
): Promise<readonly DashboardWebhookDelivery[]> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    return [];
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const result = await db.query(
    `SELECT id, "eventId", "eventType", status::text AS status, "attemptCount", "status_code" AS "statusCode", success, "lastError", "createdAt"
     FROM "WebhookDelivery"
     WHERE "webhookId" = $1 AND "organizationId" = $2
     ORDER BY "createdAt" DESC
     LIMIT 20`,
    [webhookId, orgId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status,
    attemptCount: row.attemptCount,
    statusCode: row.statusCode,
    success: row.success,
    lastError: row.lastError,
    createdAt: (row.createdAt as Date).toISOString(),
  }));
}
