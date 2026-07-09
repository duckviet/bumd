import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Worker } from "bullmq";
import { createBullMqDeployWorker } from "./bullmq-deploy-worker.js";
import { VersionsWorker } from "./versions-worker.js";
import { bullMqOptionsFromRedisUrl } from "../webhooks/webhook-queue-provider.js";
import type { DeployJobData } from "./deploy-types.js";

@Injectable()
export class DeployWorkerBootstrap implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<DeployJobData> | null = null;

  public constructor(private readonly deployWorker: VersionsWorker) {}

  public onModuleInit(): void {
    const options = bullMqOptionsFromRedisUrl();
    if (options === null) {
      return;
    }
    this.worker = createBullMqDeployWorker({
      worker: this.deployWorker,
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
