import type { VersionRecord } from "../versions/deploy-types.js";

export const WebhookEventType = {
  VersionCreated: "version.created",
  VersionFailed: "version.failed",
  DiffBreakingDetected: "diff.breaking_detected",
} as const;

export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType];

export const WebhookDeliveryStatus = {
  Delivered: "delivered",
  Retrying: "retrying",
  Failed: "failed",
} as const;

export type WebhookDeliveryStatus = (typeof WebhookDeliveryStatus)[keyof typeof WebhookDeliveryStatus];

export type WebhookEndpoint = {
  readonly id: string;
  readonly organizationId: string;
  readonly url: string;
  readonly secret: string;
  readonly enabled: boolean;
  readonly eventTypes: readonly WebhookEventType[];
};

export type WebhookEventPayload = {
  readonly id: string;
  readonly type: WebhookEventType;
  readonly createdAt: string;
  readonly organization: {
    readonly id: string;
    readonly slug: string;
  };
  readonly doc: {
    readonly id: string;
    readonly slug: string;
  };
  readonly branch: {
    readonly id: string;
    readonly slug: string;
  };
  readonly version: {
    readonly id: string;
    readonly sha256: string;
    readonly status: VersionRecord["status"];
  };
  readonly data: {
    readonly diff?: {
      readonly hasBreaking: boolean;
      readonly markdown: string;
    };
  };
};

export type WebhookDeliveryJob = {
  readonly webhookId: string;
  readonly event: WebhookEventPayload;
  readonly attemptNumber: number;
};

export type QueuedWebhookDeliveryJob = {
  readonly job: WebhookDeliveryJob;
  readonly delayMs: number;
};

export type WebhookDeliveryAttempt = {
  readonly id: string;
  readonly organizationId: string;
  readonly webhookId: string;
  readonly eventId: string;
  readonly eventType: WebhookEventType;
  readonly payload: WebhookEventPayload;
  readonly attemptNumber: number;
  readonly status: WebhookDeliveryStatus;
  readonly statusCode: number | null;
  readonly success: boolean;
  readonly error: string | null;
  readonly nextDelayMs: number | null;
};

export type RegisteredWebhookInput = {
  readonly organizationId: string;
  readonly url: string;
  readonly secret: string;
  readonly eventTypes: readonly WebhookEventType[];
};
