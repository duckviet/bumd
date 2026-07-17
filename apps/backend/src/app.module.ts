import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";
import { VersionsModule } from "./versions/versions.module.js";
import { GithubModule } from "./github/github.module.js";
import { TestWorkflowsModule } from "./test-workflows/test-workflows.module.js";

@Module({
  imports: [VersionsModule, CatalogModule, GithubModule, TestWorkflowsModule],
})
export class AppModule {}
