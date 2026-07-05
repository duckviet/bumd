import type { InMemoryDeployQueue } from "../versions/in-memory-deploy-queue.js";
import type { GithubJobData } from "./github-types.js";

export type GithubQueue = {
  enqueue(data: GithubJobData): Promise<void>;
};

export const GITHUB_QUEUE = "GITHUB_QUEUE" as const;

type DequeueCallback = (data: GithubJobData) => Promise<void>;

export class InMemoryGithubQueue implements GithubQueue {
  private autoProcessing: DequeueCallback | null = null;
  private readonly queue: GithubJobData[] = [];

  public async enqueue(data: GithubJobData): Promise<void> {
    if (this.autoProcessing !== null) {
      await this.autoProcessing(data);
    } else {
      this.queue.push(data);
    }
  }

  public enableAutoProcessing(callback: DequeueCallback): void {
    this.autoProcessing = callback;
  }

  public async drainOne(): Promise<GithubJobData | undefined> {
    return this.queue.shift();
  }
}
