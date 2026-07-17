import { Logger } from "@nestjs/common";
import { Queue, type JobsOptions } from "bullmq";
import type { TestWorkflowJobData } from "./runner/test-workflow-runner.service.js";
import { TEST_WORKFLOW_QUEUE_NAME } from "./runner/test-workflow-queue.js";

export class TestWorkflowRunDispatcher {
  private readonly queue: Queue<TestWorkflowJobData> | null;
  private readonly logger = new Logger(TestWorkflowRunDispatcher.name);

  public constructor(redisUrl: string | undefined) {
    this.queue = redisUrl
      ? new Queue<TestWorkflowJobData>(TEST_WORKFLOW_QUEUE_NAME, { connection: { url: redisUrl } })
      : null;
  }

  public async close(): Promise<void> {
    await this.queue?.close();
  }

  public async enqueue(data: TestWorkflowJobData): Promise<void> {
    if (this.queue === null) {
      this.logger.warn(`No Redis URL configured; running workflow ${data.runId} synchronously in background`);
      return;
    }
    const options: JobsOptions = {
      jobId: `test-workflow-${data.runId}`,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    };
    await this.queue.add("run-workflow", data, options);
  }
}
