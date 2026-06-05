import { BullMqWebhookQueue } from "./bullmq-webhook-queue.js";
import { InMemoryWebhookQueue } from "./in-memory-webhook-queue.js";
import type { WebhookQueue } from "./webhook-ports.js";

export function createWebhookQueue(inMemoryQueue: InMemoryWebhookQueue): WebhookQueue {
  const options = bullMqOptionsFromRedisUrl();
  if (options === null) {
    return inMemoryQueue;
  }
  return new BullMqWebhookQueue(options);
}

export function bullMqOptionsFromRedisUrl(): {
  readonly connection: { readonly host: string; readonly port: number; readonly password?: string };
} | null {
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl === undefined || redisUrl.trim() === "") {
    return null;
  }
  const parsed = new URL(redisUrl);
  const port = parsed.port === "" ? 6379 : Number.parseInt(parsed.port, 10);
  if (parsed.password === "") {
    return { connection: { host: parsed.hostname, port } };
  }
  return { connection: { host: parsed.hostname, port, password: decodeURIComponent(parsed.password) } };
}
