import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";

const port = Number.parseInt(process.env["PORT"] ?? "3100", 10);
const host = process.env["HOST"] ?? "0.0.0.0";

const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
  logger: ["error", "warn", "log", "debug"],
  rawBody: true,
});

await app.listen(port, host);
console.log(`backend-ready http://${host}:${port}`);

async function shutdown(): Promise<void> {
  await app.close();
}

process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

process.once("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
