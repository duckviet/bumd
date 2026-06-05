import { Module } from "@nestjs/common";
import { AdminSessionGuard } from "../auth/admin-session.guard.js";
import { ApiTokenCrypto } from "../auth/api-token-crypto.js";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import { ApiTokensController } from "../auth/api-tokens.controller.js";
import { API_TOKEN_STORE } from "../auth/auth-ports.js";
import { createApiTokenStore } from "../auth/database-api-token-store.js";
import { InMemoryWebhookQueue } from "../webhooks/in-memory-webhook-queue.js";
import { createWebhookStore } from "../webhooks/database-webhook-store.js";
import { KyWebhookHttpClient } from "../webhooks/webhook-http-client.js";
import { WebhookDeliveryWorker, WebhookDispatcher } from "../webhooks/webhook-dispatcher.js";
import { WEBHOOK_HTTP_CLIENT, WEBHOOK_QUEUE, WEBHOOK_STORE } from "../webhooks/webhook-ports.js";
import { createWebhookQueue } from "../webhooks/webhook-queue-provider.js";
import { WebhookWorkerBootstrap } from "../webhooks/webhook-worker-bootstrap.js";
import { DEPLOY_DIFF_ENGINE, DEPLOY_QUEUE, DEPLOY_STORE } from "./deploy-ports.js";
import { OasdiffDeployDiffEngine } from "./diff-engine-adapter.js";
import { InMemoryDeployQueue } from "./in-memory-deploy-queue.js";
import { InMemoryDeployStore } from "./in-memory-deploy-store.js";
import { DeploysController, VersionsController } from "./versions.controller.js";
import { VersionsService } from "./versions.service.js";
import { VersionsWorker } from "./versions-worker.js";

@Module({
  controllers: [VersionsController, DeploysController, ApiTokensController],
  providers: [
    ApiTokenCrypto,
    AdminSessionGuard,
    ApiTokenGuard,
    VersionsService,
    VersionsWorker,
    OasdiffDeployDiffEngine,
    InMemoryDeployStore,
    InMemoryDeployQueue,
    InMemoryWebhookQueue,
    KyWebhookHttpClient,
    WebhookDispatcher,
    WebhookDeliveryWorker,
    WebhookWorkerBootstrap,
    { provide: DEPLOY_STORE, useExisting: InMemoryDeployStore },
    { provide: API_TOKEN_STORE, inject: [InMemoryDeployStore, ApiTokenCrypto], useFactory: createApiTokenStore },
    { provide: DEPLOY_QUEUE, useExisting: InMemoryDeployQueue },
    { provide: DEPLOY_DIFF_ENGINE, useExisting: OasdiffDeployDiffEngine },
    { provide: WEBHOOK_STORE, inject: [InMemoryDeployStore], useFactory: createWebhookStore },
    { provide: WEBHOOK_QUEUE, inject: [InMemoryWebhookQueue], useFactory: createWebhookQueue },
    { provide: WEBHOOK_HTTP_CLIENT, useExisting: KyWebhookHttpClient },
  ],
  exports: [VersionsWorker, InMemoryDeployQueue, InMemoryDeployStore, InMemoryWebhookQueue, WebhookDeliveryWorker],
})
export class VersionsModule {}
