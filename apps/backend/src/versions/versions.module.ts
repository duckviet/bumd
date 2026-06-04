import { Module } from "@nestjs/common";
import { DEPLOY_QUEUE, DEPLOY_STORE } from "./deploy-ports.js";
import { InMemoryDeployQueue } from "./in-memory-deploy-queue.js";
import { InMemoryDeployStore } from "./in-memory-deploy-store.js";
import { DeploysController, VersionsController } from "./versions.controller.js";
import { VersionsService } from "./versions.service.js";
import { VersionsWorker } from "./versions-worker.js";

@Module({
  controllers: [VersionsController, DeploysController],
  providers: [
    VersionsService,
    VersionsWorker,
    InMemoryDeployStore,
    InMemoryDeployQueue,
    { provide: DEPLOY_STORE, useExisting: InMemoryDeployStore },
    { provide: DEPLOY_QUEUE, useExisting: InMemoryDeployQueue },
  ],
  exports: [VersionsWorker, InMemoryDeployQueue, InMemoryDeployStore],
})
export class VersionsModule {}
