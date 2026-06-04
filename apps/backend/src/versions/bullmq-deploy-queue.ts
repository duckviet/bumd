import { Queue, type JobsOptions } from "bullmq";
import type { DeployJobData, DeployJobRecord } from "./deploy-types.js";
import type { DeployQueue } from "./deploy-ports.js";
import { DEPLOY_QUEUE_NAME } from "./bullmq-deploy-worker.js";

export class BullMqDeployQueue implements DeployQueue {
  private readonly queue: Queue<DeployJobData>;

  public constructor(connection: ConstructorParameters<typeof Queue<DeployJobData>>[1]) {
    this.queue = new Queue<DeployJobData>(DEPLOY_QUEUE_NAME, connection);
  }

  public async enqueueDeploy(data: DeployJobData): Promise<DeployJobRecord> {
    const jobKey = `version:${data.versionId}:parse`;
    const options: JobsOptions = {
      jobId: jobKey,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    };
    await this.queue.add("parse-validate-diff-webhook", data, options);
    return {
      id: jobKey,
      versionId: data.versionId,
      jobKey,
      status: "queued",
    };
  }
}

