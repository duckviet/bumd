import { Queue, type JobsOptions } from "bullmq";
import type { WebhookQueue } from "./webhook-ports.js";
import type { WebhookDeliveryJob } from "./webhook-types.js";

export const WEBHOOK_QUEUE_NAME = "webhooks";

export class BullMqWebhookQueue implements WebhookQueue {
  private readonly queue: Queue<WebhookDeliveryJob>;

  public constructor(connection: ConstructorParameters<typeof Queue<WebhookDeliveryJob>>[1]) {
    this.queue = new Queue<WebhookDeliveryJob>(WEBHOOK_QUEUE_NAME, connection);
  }

  public async enqueueDelivery(input: {
    readonly job: WebhookDeliveryJob;
    readonly delayMs: number;
  }): Promise<void> {
    const options: JobsOptions = {
      jobId: `webhook:${input.job.event.id}:${input.job.webhookId}:${input.job.attemptNumber}`,
      attempts: 1,
      delay: input.delayMs,
    };
    await this.queue.add("deliver-webhook", input.job, options);
  }
}
