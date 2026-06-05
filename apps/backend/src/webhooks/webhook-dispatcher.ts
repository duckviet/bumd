import { Inject, Injectable } from "@nestjs/common";
import { deliveryErrorMessage } from "./webhook-http-client.js";
import { WEBHOOK_HTTP_CLIENT, WEBHOOK_QUEUE, WEBHOOK_STORE, type WebhookHttpClient, type WebhookQueue, type WebhookStore } from "./webhook-ports.js";
import { nextWebhookRetryDelay } from "./webhook-retry-policy.js";
import { signWebhookRequest } from "./webhook-signature.js";
import { WebhookDeliveryStatus, type WebhookDeliveryJob, type WebhookEndpoint, type WebhookEventPayload } from "./webhook-types.js";

@Injectable()
export class WebhookDispatcher {
  public constructor(
    @Inject(WEBHOOK_STORE) private readonly store: WebhookStore,
    @Inject(WEBHOOK_QUEUE) private readonly queue: WebhookQueue,
  ) {}

  public async enqueueEvent(payload: WebhookEventPayload): Promise<readonly WebhookEventPayload[]> {
    const webhooks = await this.store.listSubscribedWebhooks({
      organizationId: payload.organization.id,
      eventType: payload.type,
    });
    await Promise.all(
      webhooks.map((webhook) =>
        this.queue.enqueueDelivery({
          job: { webhookId: webhook.id, event: payload, attemptNumber: 1 },
          delayMs: 0,
        }),
      ),
    );
    return webhooks.map(() => payload);
  }
}

@Injectable()
export class WebhookDeliveryWorker {
  public constructor(
    @Inject(WEBHOOK_STORE) private readonly store: WebhookStore,
    @Inject(WEBHOOK_QUEUE) private readonly queue: WebhookQueue,
    @Inject(WEBHOOK_HTTP_CLIENT) private readonly httpClient: WebhookHttpClient,
  ) {}

  public async process(job: WebhookDeliveryJob): Promise<void> {
    const webhook = await this.store.getWebhookEndpoint(job.webhookId);
    if (webhook === null) {
      await this.store.recordDeliveryAttempt({
        organizationId: job.event.organization.id,
        webhookId: job.webhookId,
        eventId: job.event.id,
        eventType: job.event.type,
        payload: job.event,
        attemptNumber: job.attemptNumber,
        status: WebhookDeliveryStatus.Failed,
        statusCode: null,
        success: false,
        error: "webhook_endpoint_missing",
        nextDelayMs: null,
      });
      return;
    }
    const signed = signWebhookRequest({ webhook, payload: job.event });
    const outcome = await this.deliver(webhook, signed);
    const nextDelayMs = nextWebhookRetryDelay({
      attemptNumber: job.attemptNumber,
      statusCode: outcome.statusCode,
      success: outcome.success,
    });
    await this.store.recordDeliveryAttempt({
      organizationId: webhook.organizationId,
      webhookId: webhook.id,
      eventId: job.event.id,
      eventType: job.event.type,
      payload: job.event,
      attemptNumber: job.attemptNumber,
      status: deliveryStatus(outcome.success, nextDelayMs),
      statusCode: outcome.statusCode,
      success: outcome.success,
      error: outcome.error,
      nextDelayMs,
    });
    if (nextDelayMs !== null) {
      await this.queue.enqueueDelivery({
        job: { ...job, attemptNumber: job.attemptNumber + 1 },
        delayMs: nextDelayMs,
      });
    }
  }

  private async deliver(
    webhook: WebhookEndpoint,
    signed: { readonly headers: Record<string, string>; readonly rawBody: string },
  ): Promise<{ readonly statusCode: number | null; readonly success: boolean; readonly error: string | null }> {
    try {
      const response = await this.httpClient.post({
        url: webhook.url,
        headers: signed.headers,
        rawBody: signed.rawBody,
      });
      return { statusCode: response.statusCode, success: response.success, error: null };
    } catch (error) {
      if (error instanceof Error) {
        return { statusCode: null, success: false, error: deliveryErrorMessage(error) };
      }
      throw error;
    }
  }
}

function deliveryStatus(success: boolean, nextDelayMs: number | null): WebhookDeliveryStatus {
  if (success) {
    return WebhookDeliveryStatus.Delivered;
  }
  return nextDelayMs === null ? WebhookDeliveryStatus.Failed : WebhookDeliveryStatus.Retrying;
}
