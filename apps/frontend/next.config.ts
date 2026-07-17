import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  typedRoutes: false,
  // Pin workspace root so Turbopack resolves pnpm monorepo deps correctly.
  // Do NOT enable watchOptions.pollIntervalMs here: on native ext4 (WSL home)
  // inotify works, and polling floods "watch error ... No such file or directory"
  // for optional/missing package paths.
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
