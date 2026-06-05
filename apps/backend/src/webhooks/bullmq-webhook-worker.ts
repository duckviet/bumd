import { Worker, type Job, type WorkerOptions } from "bullmq";
import { WEBHOOK_QUEUE_NAME } from "./bullmq-webhook-queue.js";
import type { WebhookDeliveryJob } from "./webhook-types.js";
import { WebhookDeliveryWorker } from "./webhook-dispatcher.js";

export function createBullMqWebhookWorker(options: {
  readonly worker: WebhookDeliveryWorker;
  readonly bullMqOptions: WorkerOptions;
}): Worker<WebhookDeliveryJob> {
  return new Worker<WebhookDeliveryJob>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookDeliveryJob>) => options.worker.process(job.data),
    options.bullMqOptions,
  );
}
