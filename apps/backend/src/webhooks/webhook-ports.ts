import type { RegisteredWebhookInput, WebhookDeliveryAttempt, WebhookDeliveryJob, WebhookEndpoint, WebhookEventPayload, WebhookEventType } from "./webhook-types.js";

export const WEBHOOK_STORE = Symbol("WEBHOOK_STORE");
export const WEBHOOK_QUEUE = Symbol("WEBHOOK_QUEUE");
export const WEBHOOK_HTTP_CLIENT = Symbol("WEBHOOK_HTTP_CLIENT");

export type WebhookStore = {
  readonly registerWebhook: (input: RegisteredWebhookInput) => WebhookEndpoint;
  readonly listSubscribedWebhooks: (input: {
    readonly organizationId: string;
    readonly eventType: WebhookEventType;
  }) => Promise<readonly WebhookEndpoint[]>;
  readonly getWebhookEndpoint: (webhookId: string) => Promise<WebhookEndpoint | null>;
  readonly recordDeliveryAttempt: (input: Omit<WebhookDeliveryAttempt, "id">) => Promise<WebhookDeliveryAttempt>;
  readonly webhookDeliveries: () => readonly WebhookDeliveryAttempt[];
};

export type WebhookQueue = {
  readonly enqueueDelivery: (input: {
    readonly job: WebhookDeliveryJob;
    readonly delayMs: number;
  }) => Promise<void>;
};

export type DrainableWebhookQueue = WebhookQueue & {
  readonly drain: (processor: (job: WebhookDeliveryJob) => Promise<void>) => Promise<void>;
  readonly queuedJobs: () => readonly unknown[];
  readonly failNextEnqueue: () => void;
};

export type WebhookHttpClient = {
  readonly post: (input: {
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly rawBody: string;
  }) => Promise<{
    readonly statusCode: number;
    readonly success: boolean;
  }>;
};

export type EnqueueWebhookEventInput = {
  readonly payload: WebhookEventPayload;
};
