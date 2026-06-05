import { Injectable } from "@nestjs/common";
import type { DrainableWebhookQueue } from "./webhook-ports.js";
import type { QueuedWebhookDeliveryJob, WebhookDeliveryJob } from "./webhook-types.js";

@Injectable()
export class InMemoryWebhookQueue implements DrainableWebhookQueue {
  private readonly jobs: QueuedWebhookDeliveryJob[] = [];
  private shouldFailNextEnqueue = false;

  public async enqueueDelivery(input: {
    readonly job: WebhookDeliveryJob;
    readonly delayMs: number;
  }): Promise<void> {
    if (this.shouldFailNextEnqueue) {
      this.shouldFailNextEnqueue = false;
      throw new Error("webhook_enqueue_failed");
    }
    this.jobs.push(input);
  }

  public async drain(processor: (job: WebhookDeliveryJob) => Promise<void>): Promise<void> {
    while (this.jobs.length > 0) {
      const queued = this.jobs.shift();
      if (queued !== undefined) {
        await processor(queued.job);
      }
    }
  }

  public queuedJobs(): readonly unknown[] {
    return this.jobs;
  }

  public failNextEnqueue(): void {
    this.shouldFailNextEnqueue = true;
  }
}
