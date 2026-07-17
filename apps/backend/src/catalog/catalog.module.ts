import { Module } from "@nestjs/common";
import { ApiTokenCrypto } from "../auth/api-token-crypto.js";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import { API_TOKEN_STORE } from "../auth/auth-ports.js";
import { createApiTokenStore } from "../auth/database-api-token-store.js";
import { InMemoryDeployStore } from "../versions/in-memory-deploy-store.js";
import { CatalogService } from "./catalog.service.js";
import { CatalogJobsController, CatalogMembersController, CatalogWebhooksController, PortalDocsController, CatalogInvitesController } from "./catalog.controller.js";
import { StorageModule } from "../storage/storage.module.js";
import { OBJECT_STORE, type ObjectStore } from "../storage/object-store-port.js";
import { VersionsModule } from "../versions/versions.module.js";
import { DashboardManagementController } from "./dashboard-management.controller.js";
import { DashboardDocsService } from "./dashboard-docs.service.js";
import { DashboardApiTokensService } from "./dashboard-api-tokens.service.js";

@Module({
  imports: [StorageModule, VersionsModule],
  controllers: [PortalDocsController, CatalogJobsController, CatalogMembersController, CatalogWebhooksController, CatalogInvitesController, DashboardManagementController],
  providers: [
    ApiTokenCrypto,
    ApiTokenGuard,
    CatalogService,
    DashboardDocsService,
    DashboardApiTokensService,
    {
      provide: API_TOKEN_STORE,
      useFactory: (crypto: ApiTokenCrypto, objectStore: ObjectStore) =>
        createApiTokenStore(new InMemoryDeployStore(crypto, objectStore), crypto),
      inject: [ApiTokenCrypto, OBJECT_STORE],
    },
  ],
})
export class CatalogModule {}
