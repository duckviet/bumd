import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { AppModule } from "../app.module.js";
import { InMemoryDeployQueue } from "../versions/in-memory-deploy-queue.js";
import { VersionsWorker } from "../versions/versions-worker.js";

const port = Number.parseInt(process.env["PORT"] ?? "3100", 10);
const app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });
const queue = app.get(InMemoryDeployQueue);
const worker = app.get(VersionsWorker);

queue.enableAutoProcessing(async (data) => {
  await worker.process(data);
});

await app.listen(port, "127.0.0.1");
console.log(`manual-server-ready http://127.0.0.1:${port}`);

async function shutdown(): Promise<void> {
  await app.close();
}

process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

process.once("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
