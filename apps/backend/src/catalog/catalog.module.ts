import { Module } from "@nestjs/common";
import { ApiTokenCrypto } from "../auth/api-token-crypto.js";
import { ApiTokenGuard } from "../auth/api-token.guard.js";
import { API_TOKEN_STORE } from "../auth/auth-ports.js";
import { createApiTokenStore } from "../auth/database-api-token-store.js";
import { InMemoryDeployStore } from "../versions/in-memory-deploy-store.js";
import { CatalogService } from "./catalog.service.js";
import { CatalogWebhooksController, PortalDocsController } from "./catalog.controller.js";
import { StorageModule } from "../storage/storage.module.js";
import { OBJECT_STORE, type ObjectStore } from "../storage/object-store-port.js";

@Module({
  imports: [StorageModule],
  controllers: [PortalDocsController, CatalogWebhooksController],
  providers: [
    ApiTokenCrypto,
    ApiTokenGuard,
    CatalogService,
    {
      provide: API_TOKEN_STORE,
      useFactory: (crypto: ApiTokenCrypto, objectStore: ObjectStore) =>
        createApiTokenStore(new InMemoryDeployStore(crypto, objectStore), crypto),
      inject: [ApiTokenCrypto, OBJECT_STORE],
    },
  ],
})
export class CatalogModule {}
