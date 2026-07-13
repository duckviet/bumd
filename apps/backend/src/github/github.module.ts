import { Module } from "@nestjs/common";
import {
  GithubInstallationsController,
  GithubRepositoriesController,
  GithubMappingsController,
  GithubWebhookController,
} from "./github.controller.js";
import { DashboardGithubController } from "./dashboard-github.controller.js";
import { GithubService } from "./github.service.js";
import { GithubWorker } from "./github-worker.js";
import { GITHUB_QUEUE, InMemoryGithubQueue } from "./github-queue.js";
import { DEPLOY_QUEUE, DEPLOY_STORE } from "../versions/deploy-ports.js";
import { VersionsModule } from "../versions/versions.module.js";

@Module({
  imports: [VersionsModule],
  controllers: [
    GithubInstallationsController,
    GithubRepositoriesController,
    GithubMappingsController,
    GithubWebhookController,
    DashboardGithubController,
  ],
  providers: [
    GithubService,
    GithubWorker,
    InMemoryGithubQueue,
    {
      provide: GITHUB_QUEUE,
      useExisting: InMemoryGithubQueue,
    },
  ],
  exports: [GithubService, GithubWorker, InMemoryGithubQueue],
})
export class GithubModule {}
