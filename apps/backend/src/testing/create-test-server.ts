import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { AppModule } from "../app.module.js";
import { InMemoryDeployQueue } from "../versions/in-memory-deploy-queue.js";
import { InMemoryDeployStore } from "../versions/in-memory-deploy-store.js";
import type { DeployJobData, WorkerResult } from "../versions/deploy-types.js";
import { VersionsWorker } from "../versions/versions-worker.js";

export type TestServer = {
  readonly inject: (input: {
    readonly method: "POST";
    readonly url: string;
    readonly headers?: Record<string, string>;
    readonly payload?: Record<string, unknown>;
  }) => Promise<LightMyRequestResponse>;
  readonly processDeployJobs: () => Promise<WorkerResult>;
  readonly deployJobCount: () => number;
  readonly enableAutoProcessing: () => void;
  readonly close: () => Promise<void>;
};

export async function createTestServer(): Promise<TestServer> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const queue = app.get(InMemoryDeployQueue);
  const store = app.get(InMemoryDeployStore);
  const worker = app.get(VersionsWorker);
  let lastWorkerResult: WorkerResult | null = null;

  async function process(data: DeployJobData): Promise<void> {
    lastWorkerResult = await worker.process(data);
  }

  return {
    inject: (input) => {
      const options: InjectOptions = {
        method: input.method,
        url: input.url,
      };
      if (input.headers !== undefined) {
        options.headers = input.headers;
      }
      if (input.payload !== undefined) {
        options.payload = input.payload;
      }
      return app.getHttpAdapter().getInstance().inject(options);
    },
    processDeployJobs: async () => {
      await queue.drain(process);
      if (lastWorkerResult === null) {
        throw new Error("deploy_processing_failed");
      }
      return lastWorkerResult;
    },
    deployJobCount: () => store.deployJobCount(),
    enableAutoProcessing: () => {
      queue.enableAutoProcessing(process);
    },
    close: () => app.close(),
  };
}
