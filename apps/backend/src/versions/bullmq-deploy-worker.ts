import { Worker, type Job, type WorkerOptions } from "bullmq";
import type { DeployJobData } from "./deploy-types.js";
import { VersionsWorker } from "./versions-worker.js";

export const DEPLOY_QUEUE_NAME = "deploy";

export function createBullMqDeployWorker(options: {
  readonly worker: VersionsWorker;
  readonly bullMqOptions: WorkerOptions;
}): Worker<DeployJobData> {
  return new Worker<DeployJobData>(
    DEPLOY_QUEUE_NAME,
    async (job: Job<DeployJobData>) => options.worker.process(job.data),
    options.bullMqOptions,
  );
}

