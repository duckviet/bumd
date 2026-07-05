import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { WebhookDeliveryStatus, type RegisteredWebhookInput, type WebhookDeliveryAttempt, type WebhookEndpoint, type WebhookEventType } from "./webhook-types.js";
import type { WebhookStore } from "./webhook-ports.js";
import { decryptSecret } from "./webhook-encryption.js";

type WebhookRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly url: string;
  readonly secretRef: string;
  readonly enabled: boolean;
  readonly eventTypes: readonly string[];
};

export class DatabaseWebhookStore implements WebhookStore {
  private readonly pool: Pool;

  public constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  public registerWebhook(_input: RegisteredWebhookInput): WebhookEndpoint {
    throw new Error("webhook_registration_requires_api");
  }

  public async listSubscribedWebhooks(input: {
    readonly organizationId: string;
    readonly eventType: WebhookEventType;
  }): Promise<readonly WebhookEndpoint[]> {
    const result = await this.pool.query<WebhookRow>(
      'SELECT "id", "organizationId", "url", "secretRef", "enabled", "eventTypes" FROM "Webhook" WHERE "organizationId" = $1 AND "enabled" = true AND $2 = ANY("eventTypes")',
      [input.organizationId, input.eventType],
    );
    return result.rows.flatMap((row) => {
      const secret = decryptSecret(row.secretRef);

      if (secret === null) {
        return [];
      }
      return [
        {
          id: row.id,
          organizationId: row.organizationId,
          url: row.url,
          secret,
          enabled: row.enabled,
          eventTypes: row.eventTypes.filter(isWebhookEventType),
        },
      ];
    });
  }

  public async getWebhookEndpoint(webhookId: string): Promise<WebhookEndpoint | null> {
    const result = await this.pool.query<WebhookRow>(
      'SELECT "id", "organizationId", "url", "secretRef", "enabled", "eventTypes" FROM "Webhook" WHERE "id" = $1 AND "enabled" = true',
      [webhookId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    const secret = decryptSecret(row.secretRef);

    if (secret === null) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      url: row.url,
      secret,
      enabled: row.enabled,
      eventTypes: row.eventTypes.filter(isWebhookEventType),
    };
  }

  public async recordDeliveryAttempt(input: Omit<WebhookDeliveryAttempt, "id">): Promise<WebhookDeliveryAttempt> {
    const id = `del_${randomUUID()}`;
    const nextAttemptAt = input.nextDelayMs === null ? null : new Date(Date.now() + input.nextDelayMs);
    await this.pool.query(
      'INSERT INTO "WebhookDelivery" ("id", "organizationId", "webhookId", "eventId", "eventType", "payload", "status", "attemptCount", "lastStatusCode", "status_code", "success", "lastError", "nextAttemptAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,NOW())',
      [
        id,
        input.organizationId,
        input.webhookId,
        input.eventId,
        input.eventType,
        JSON.stringify(input.payload),
        input.status,
        input.attemptNumber,
        input.statusCode,
        input.success,
        input.error,
        nextAttemptAt,
      ],
    );
    return { id, ...input };
  }

  public webhookDeliveries(): readonly WebhookDeliveryAttempt[] {
    return [];
  }
}

export function createWebhookStore(inMemoryStore: WebhookStore): WebhookStore {
  if (process.env["WEBHOOK_DELIVERY_STORE"] === "memory") {
    return inMemoryStore;
  }
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    return inMemoryStore;
  }
  return new DatabaseWebhookStore(databaseUrl);
}


function isWebhookEventType(value: string): value is WebhookEventType {
  return value === "version.created" || value === "version.failed" || value === "diff.breaking_detected";
}
