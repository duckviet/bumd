import { Module } from "@nestjs/common";
import { ApiTokenCrypto } from "../auth/api-token-crypto.js";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import { DashboardOrApiTokenGuard } from "../auth/dashboard-or-api-token.guard.js";
import { API_TOKEN_STORE } from "../auth/auth-ports.js";
import { createApiTokenStore } from "../auth/database-api-token-store.js";
import { VersionsModule } from "../versions/versions.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { OBJECT_STORE, type ObjectStore } from "../storage/object-store-port.js";
import { InMemoryDeployStore } from "../versions/in-memory-deploy-store.js";
import { DEPLOY_STORE } from "../versions/deploy-ports.js";
import { createDeployStore } from "../versions/database-deploy-store.js";
import { TryItOutService } from "../try-it-out/try-it-out.service.js";
import { KyTryItOutHttpClient } from "../try-it-out/try-it-out-http-client.js";
import { TRY_IT_OUT_HTTP_CLIENT } from "../try-it-out/try-it-out-types.js";
import { TestWorkflowsController } from "./test-workflows.controller.js";
import { TestWorkflowsService } from "./test-workflows.service.js";
import { TestEnvironmentsController } from "./test-environments.controller.js";
import { TestEnvironmentsService } from "./test-environments.service.js";
import { TestWorkflowRunsController } from "./test-workflow-runs.controller.js";
import { TestWorkflowRunsService } from "./test-workflow-runs.service.js";
import { TestWorkflowRunnerService } from "./runner/test-workflow-runner.service.js";
import { TestWorkflowReaperService } from "./runner/test-workflow-reaper.service.js";

@Module({
  imports: [StorageModule, VersionsModule],
  controllers: [
    TestWorkflowsController,
    TestEnvironmentsController,
    TestWorkflowRunsController,
  ],
  providers: [
    ApiTokenCrypto,
    ApiTokenGuard,
    DashboardOrApiTokenGuard,
    KyTryItOutHttpClient,
    TryItOutService,
    TestWorkflowsService,
    TestEnvironmentsService,
    TestWorkflowRunsService,
    TestWorkflowRunnerService,
    TestWorkflowReaperService,
    {
      provide: TRY_IT_OUT_HTTP_CLIENT,
      useExisting: KyTryItOutHttpClient,
    },
    {
      provide: API_TOKEN_STORE,
      useFactory: (crypto: ApiTokenCrypto, objectStore: ObjectStore) =>
        createApiTokenStore(new InMemoryDeployStore(crypto, objectStore), crypto),
      inject: [ApiTokenCrypto, OBJECT_STORE],
    },
  ],
})
export class TestWorkflowsModule {}
