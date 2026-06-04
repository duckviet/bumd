import { Module } from "@nestjs/common";
import { VersionsModule } from "./versions/versions.module.js";

@Module({
  imports: [VersionsModule],
})
export class AppModule {}

