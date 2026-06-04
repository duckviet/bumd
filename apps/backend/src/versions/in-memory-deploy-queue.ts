import { Injectable } from "@nestjs/common";
import type { DeployJobData, DeployJobRecord } from "./deploy-types.js";
import type { DeployQueue } from "./deploy-ports.js";

@Injectable()
export class InMemoryDeployQueue implements DeployQueue {
  private readonly jobs: DeployJobData[] = [];
  private autoProcessor: ((data: DeployJobData) => Promise<void>) | null = null;

  public async enqueueDeploy(data: DeployJobData): Promise<DeployJobRecord> {
    this.jobs.push(data);
    const processor = this.autoProcessor;
    if (processor !== null) {
      setImmediate(() => {
        void processor(data);
      });
    }
    return {
      id: `job_${data.versionId}`,
      versionId: data.versionId,
      jobKey: `version:${data.versionId}:parse`,
      status: "queued",
    };
  }

  public async drain(processor: (data: DeployJobData) => Promise<void>): Promise<void> {
    while (this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (job !== undefined) {
        await processor(job);
      }
    }
  }

  public enableAutoProcessing(processor: (data: DeployJobData) => Promise<void>): void {
    this.autoProcessor = processor;
  }
}

