import { createHmac } from "node:crypto";
import type { WebhookEndpoint, WebhookEventPayload } from "./webhook-types.js";

export type SignedWebhookRequest = {
  readonly rawBody: string;
  readonly headers: Record<string, string>;
};

export function signWebhookRequest(input: {
  readonly webhook: WebhookEndpoint;
  readonly payload: WebhookEventPayload;
}): SignedWebhookRequest {
  const rawBody = JSON.stringify(input.payload);
  const digest = createHmac("sha256", input.webhook.secret).update(rawBody).digest("hex");
  return {
    rawBody,
    headers: {
      "content-type": "application/json",
      "X-Bumd-Signature": `sha256=${digest}`,
      "Bumd-Event-Id": input.payload.id,
      "Bumd-Event-Type": input.payload.type,
    },
  };
}
