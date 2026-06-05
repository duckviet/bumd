import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Worker } from "bullmq";
import { createBullMqWebhookWorker } from "./bullmq-webhook-worker.js";
import { WebhookDeliveryWorker } from "./webhook-dispatcher.js";
import { bullMqOptionsFromRedisUrl } from "./webhook-queue-provider.js";
import type { WebhookDeliveryJob } from "./webhook-types.js";

@Injectable()
export class WebhookWorkerBootstrap implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<WebhookDeliveryJob> | null = null;

  public constructor(private readonly deliveryWorker: WebhookDeliveryWorker) {}

  public onModuleInit(): void {
    const options = bullMqOptionsFromRedisUrl();
    if (options === null) {
      return;
    }
    this.worker = createBullMqWebhookWorker({
      worker: this.deliveryWorker,
      bullMqOptions: options,
    });
  }

  public async onModuleDestroy(): Promise<void> {
    const worker = this.worker;
    if (worker !== null) {
      await worker.close();
      this.worker = null;
    }
  }
}
