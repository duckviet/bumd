import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { AppModule } from "../app.module.js";
import { API_TOKEN_STORE } from "../auth/auth-ports.js";
import type { CreateApiTokenInput, IssuedApiToken } from "../auth/auth-types.js";
import { setGithubOidcAuthorizationsForTesting } from "../auth/github-oidc-authorization.js";
import type { GithubOidcAuthorization } from "../auth/github-oidc-types.js";
import type { GithubOidcVerifier } from "../auth/github-oidc-types.js";
import { setGithubOidcVerifierForTesting } from "../auth/github-oidc-verifier.js";
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
  readonly diffForVersion: (versionId: string) => Promise<PersistedDiffRecord>;
  readonly registerWebhook: (input: RegisteredWebhookInput) => WebhookEndpoint;
  readonly processWebhookJobs: () => Promise<void>;
  readonly webhookDeliveries: () => readonly WebhookDeliveryAttempt[];
  readonly webhookQueuedJobs: () => readonly unknown[];
  readonly failNextWebhookEnqueue: () => void;
  readonly issueApiToken: (input: CreateApiTokenInput) => Promise<IssuedApiToken>;
  readonly apiTokenMetadata: (tokenId: string) => ReturnType<InMemoryDeployStore["apiTokenMetadata"]>;
  readonly versionMetadata: (versionId: string) => ReturnType<InMemoryDeployStore["versionMetadata"]>;
  readonly enableAutoProcessing: () => void;
  readonly app: NestFastifyApplication;
  readonly close: () => Promise<void>;
};

export type TestServerOptions = {
  readonly githubOidcVerifier?: GithubOidcVerifier;
  readonly githubOidcAuthorizations?: readonly GithubOidcAuthorization[];
};

const DefaultTestGithubOidcAuthorizations: readonly GithubOidcAuthorization[] = [
  {
    organizationSlug: "acme",
    repositoryOwner: "octo",
    repositories: ["octo/payments"],
    allowedRefs: ["refs/heads/main"],
  },
];

export async function createTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const previousDeployStore = process.env["DEPLOY_STORE"];
  const previousApiTokenStore = process.env["API_TOKEN_STORE"];
  const previousApiTokenStoreId = process.env["BUMD_IN_MEMORY_API_TOKEN_STORE_ID"];
  const previousWebhookDeliveryStore = process.env["WEBHOOK_DELIVERY_STORE"];
  process.env["DEPLOY_STORE"] = "memory";
  process.env["API_TOKEN_STORE"] = "memory";
  process.env["BUMD_IN_MEMORY_API_TOKEN_STORE_ID"] = randomUUID();
  process.env["WEBHOOK_DELIVERY_STORE"] = "memory";
  setGithubOidcVerifierForTesting(options.githubOidcVerifier ?? null);
  setGithubOidcAuthorizationsForTesting(options.githubOidcAuthorizations ?? DefaultTestGithubOidcAuthorizations);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ["error", "warn"],
    rawBody: true,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const queue = app.get(InMemoryDeployQueue);
  const webhookQueue = app.get(InMemoryWebhookQueue);
  const store = app.get(InMemoryDeployStore);
  const apiTokenStore = app.get<InMemoryDeployStore>(API_TOKEN_STORE);
  const worker = app.get(VersionsWorker);
  const webhookWorker = app.get(WebhookDeliveryWorker);
  let lastWorkerResult: WorkerResult | null = null;

  async function processDeployJob(data: DeployJobData): Promise<void> {
    lastWorkerResult = await worker.process(data);
  }

  return {
    app,
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
      await queue.drain(processDeployJob);
      if (lastWorkerResult === null) {
        throw new Error("deploy_processing_failed");
      }
      return lastWorkerResult;
    },
    deployJobCount: () => store.deployJobCount(),
    diffForVersion: async (versionId) => {
      const diff = await store.diffForVersion(versionId);
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
    issueApiToken: (input) => apiTokenStore.issueApiToken(input),
    apiTokenMetadata: (tokenId) => apiTokenStore.apiTokenMetadata(tokenId),
    versionMetadata: (versionId) => store.versionMetadata(versionId),
    enableAutoProcessing: () => {
      queue.enableAutoProcessing(processDeployJob);
    },
    close: async () => {
      await app.close();
      setGithubOidcVerifierForTesting(null);
      setGithubOidcAuthorizationsForTesting(null);
      if (previousDeployStore === undefined) {
        delete process.env["DEPLOY_STORE"];
      } else {
        process.env["DEPLOY_STORE"] = previousDeployStore;
      }
      if (previousApiTokenStore === undefined) {
        delete process.env["API_TOKEN_STORE"];
      } else {
        process.env["API_TOKEN_STORE"] = previousApiTokenStore;
      }
      if (previousApiTokenStoreId === undefined) {
        delete process.env["BUMD_IN_MEMORY_API_TOKEN_STORE_ID"];
      } else {
        process.env["BUMD_IN_MEMORY_API_TOKEN_STORE_ID"] = previousApiTokenStoreId;
      }
      if (previousWebhookDeliveryStore === undefined) {
        delete process.env["WEBHOOK_DELIVERY_STORE"];
      } else {
        process.env["WEBHOOK_DELIVERY_STORE"] = previousWebhookDeliveryStore;
      }
    },
  };
}
