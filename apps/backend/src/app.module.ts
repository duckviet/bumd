import { Module } from "@nestjs/common";
import { CatalogModule } from "./catalog/catalog.module.js";
import { VersionsModule } from "./versions/versions.module.js";

@Module({
  imports: [VersionsModule, CatalogModule],
})
export class AppModule {}
