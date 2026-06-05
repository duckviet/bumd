import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { AppModule } from "../app.module.js";
import type { CreateApiTokenInput, IssuedApiToken } from "../auth/auth-types.js";
import { InMemoryWebhookQueue } from "../webhooks/in-memory-webhook-queue.js";
import type { RegisteredWebhookInput, WebhookDeliveryAttempt, WebhookEndpoint } from "../webhooks/webhook-types.js";
import { WebhookDeliveryWorker } from "../webhooks/webhook-dispatcher.js";
import { InMemoryDeployQueue } from "../versions/in-memory-deploy-queue.js";
import { InMemoryDeployStore } from "../versions/in-memory-deploy-store.js";
import type { DeployJobData, PersistedDiffRecord, WorkerResult } from "../versions/deploy-types.js";
import { VersionsWorker } from "../versions/versions-worker.js";

export type TestServer = {
  readonly inject: (input: {
    readonly method: "GET" | "POST";
    readonly url: string;
    readonly headers?: Record<string, string>;
    readonly payload?: Record<string, unknown>;
  }) => Promise<LightMyRequestResponse>;
  readonly processDeployJobs: () => Promise<WorkerResult>;
  readonly deployJobCount: () => number;
  readonly diffForVersion: (versionId: string) => PersistedDiffRecord;
  readonly registerWebhook: (input: RegisteredWebhookInput) => WebhookEndpoint;
  readonly processWebhookJobs: () => Promise<void>;
  readonly webhookDeliveries: () => readonly WebhookDeliveryAttempt[];
  readonly webhookQueuedJobs: () => readonly unknown[];
  readonly failNextWebhookEnqueue: () => void;
  readonly issueApiToken: (input: CreateApiTokenInput) => Promise<IssuedApiToken>;
  readonly apiTokenMetadata: (tokenId: string) => ReturnType<InMemoryDeployStore["apiTokenMetadata"]>;
  readonly versionMetadata: (versionId: string) => ReturnType<InMemoryDeployStore["versionMetadata"]>;
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
  const webhookQueue = app.get(InMemoryWebhookQueue);
  const store = app.get(InMemoryDeployStore);
  const worker = app.get(VersionsWorker);
  const webhookWorker = app.get(WebhookDeliveryWorker);
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
    diffForVersion: (versionId) => {
      const diff = store.diffForVersion(versionId);
      if (diff === null) {
        throw new Error("deploy_processing_failed");
      }
      return diff;
    },
    registerWebhook: (input) => store.registerWebhook(input),
    processWebhookJobs: () => webhookQueue.drain((job) => webhookWorker.process(job)),
    webhookDeliveries: () => store.webhookDeliveries(),
    webhookQueuedJobs: () => webhookQueue.queuedJobs(),
    failNextWebhookEnqueue: () => webhookQueue.failNextEnqueue(),
    issueApiToken: (input) => store.issueApiToken(input),
    apiTokenMetadata: (tokenId) => store.apiTokenMetadata(tokenId),
    versionMetadata: (versionId) => store.versionMetadata(versionId),
    enableAutoProcessing: () => {
      queue.enableAutoProcessing(process);
    },
    close: () => app.close(),
  };
}
