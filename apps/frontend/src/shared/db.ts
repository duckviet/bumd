import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "node:path";
import "server-only"

declare global {
  var __bumdDbPool: Pool | undefined;
}

export function getDb(): Pool {
  if (globalThis.__bumdDbPool !== undefined) {
    return globalThis.__bumdDbPool;
  }
  
  if (process.env["DATABASE_URL"] === undefined || process.env["DATABASE_URL"] === "") {
    // Try resolving .env from monorepo root relative to apps/frontend or process.cwd()
    dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
    if (process.env["DATABASE_URL"] === undefined || process.env["DATABASE_URL"] === "") {
      dotenv.config({ path: path.resolve(process.cwd(), ".env") });
    }
  }

  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL environment variable is not defined");
  }
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => {
    console.error("Unexpected error on idle pg client", err);
  });
  globalThis.__bumdDbPool = pool;
  return pool;
}
