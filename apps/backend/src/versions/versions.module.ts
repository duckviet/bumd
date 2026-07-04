import { Module } from "@nestjs/common";
import { AdminSessionGuard } from "../auth/admin-session.guard.js";
import { ApiTokenCrypto } from "../auth/api-token-crypto.js";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import { ApiTokensController } from "../auth/api-tokens.controller.js";
import { API_TOKEN_STORE } from "../auth/auth-ports.js";
import { createApiTokenStore } from "../auth/database-api-token-store.js";
import { createGithubOidcAuthorizationStore } from "../auth/github-oidc-authorization.js";
import { GithubOidcTokenController } from "../auth/github-oidc-token.controller.js";
import { GithubOidcTokenService } from "../auth/github-oidc-token.service.js";
import { GithubOAuthController } from "../auth/github-oauth.controller.js";
import { GithubOAuthService } from "../auth/github-oauth.service.js";
import { GITHUB_OIDC_AUTHORIZATION_STORE, GITHUB_OIDC_VERIFIER } from "../auth/github-oidc-types.js";
import { createGithubOidcVerifier } from "../auth/github-oidc-verifier.js";
import { InMemoryWebhookQueue } from "../webhooks/in-memory-webhook-queue.js";
import { InMemorySearchIndex } from "../search/in-memory-search-index.js";
import { SearchController } from "../search/search.controller.js";
import { createSearchIndex } from "../search/search-index-provider.js";
import { SEARCH_INDEX } from "../search/search-types.js";
import { KyTryItOutHttpClient } from "../try-it-out/try-it-out-http-client.js";
import { TRY_IT_OUT_HTTP_CLIENT } from "../try-it-out/try-it-out-types.js";
import { TryItOutController } from "../try-it-out/try-it-out.controller.js";
import { TryItOutService } from "../try-it-out/try-it-out.service.js";
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
import { StorageModule } from "../storage/storage.module.js";
import { OBJECT_STORE, type ObjectStore } from "../storage/object-store-port.js";
import { createDeployStore } from "./database-deploy-store.js";

@Module({
  imports: [StorageModule],
  controllers: [
    VersionsController,
    DeploysController,
    ApiTokensController,
    GithubOidcTokenController,
    GithubOAuthController,
    SearchController,
    TryItOutController,
  ],
  providers: [
    ApiTokenCrypto,
    AdminSessionGuard,
    ApiTokenGuard,
    GithubOidcTokenService,
    GithubOAuthService,
    VersionsService,
    VersionsWorker,
    OasdiffDeployDiffEngine,
    InMemoryDeployStore,
    InMemoryDeployQueue,
    InMemoryWebhookQueue,
    InMemorySearchIndex,
    KyWebhookHttpClient,
    KyTryItOutHttpClient,
    TryItOutService,
    WebhookDispatcher,
    WebhookDeliveryWorker,
    WebhookWorkerBootstrap,
    {
      provide: DEPLOY_STORE,
      inject: [InMemoryDeployStore, OBJECT_STORE],
      useFactory: (inMemory, objectStore) => createDeployStore(inMemory, objectStore),
    },
    { provide: API_TOKEN_STORE, inject: [InMemoryDeployStore, ApiTokenCrypto], useFactory: createApiTokenStore },
    { provide: GITHUB_OIDC_AUTHORIZATION_STORE, useFactory: createGithubOidcAuthorizationStore },
    { provide: GITHUB_OIDC_VERIFIER, useFactory: createGithubOidcVerifier },
    { provide: DEPLOY_QUEUE, useExisting: InMemoryDeployQueue },
    { provide: DEPLOY_DIFF_ENGINE, useExisting: OasdiffDeployDiffEngine },
    { provide: SEARCH_INDEX, inject: [InMemorySearchIndex], useFactory: createSearchIndex },
    { provide: TRY_IT_OUT_HTTP_CLIENT, useExisting: KyTryItOutHttpClient },
    { provide: WEBHOOK_STORE, inject: [InMemoryDeployStore], useFactory: createWebhookStore },
    { provide: WEBHOOK_QUEUE, inject: [InMemoryWebhookQueue], useFactory: createWebhookQueue },
    { provide: WEBHOOK_HTTP_CLIENT, useExisting: KyWebhookHttpClient },
  ],
  exports: [VersionsWorker, InMemoryDeployQueue, InMemoryDeployStore, InMemoryWebhookQueue, InMemorySearchIndex, WebhookDeliveryWorker],
})
export class VersionsModule {}
