import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import { bullMqOptionsFromRedisUrl } from "../../webhooks/webhook-queue-provider.js";
import {
  TestWorkflowRunnerService,
  type TestWorkflowJobData,
} from "./test-workflow-runner.service.js";
import { TEST_WORKFLOW_QUEUE_NAME } from "./test-workflow-queue.js";

@Injectable()
export class TestWorkflowBullMqWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<TestWorkflowJobData> | null = null;

  public constructor(private readonly runner: TestWorkflowRunnerService) {}

  public onModuleInit(): void {
    const options = bullMqOptionsFromRedisUrl();
    if (options === null) {
      return;
    }
    this.worker = new Worker<TestWorkflowJobData>(
      TEST_WORKFLOW_QUEUE_NAME,
      async (job: Job<TestWorkflowJobData>) => this.runner.process(job.data),
      options,
    );
  }

  public async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
  }
}
