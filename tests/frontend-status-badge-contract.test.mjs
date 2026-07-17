import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedBadgeFile = path.join(
  rootDir,
  "apps/frontend/src/shared/ui/status-badge.tsx",
);
const dashboardBadgeFile = path.join(
  rootDir,
  "apps/frontend/src/entities/dashboard/ui/version-status-badge.tsx",
);

function readBadgeContractSource() {
  if (fs.existsSync(dashboardBadgeFile)) {
    return [
      fs.readFileSync(dashboardBadgeFile, "utf8"),
      fs.readFileSync(sharedBadgeFile, "utf8"),
    ].join("\n");
  }

  return fs.readFileSync(sharedBadgeFile, "utf8");
}

test("pins dashboard version status badge labels and tone classes", () => {
  const source = readBadgeContractSource();

  assert.match(source, /No deploys/);
  assert.match(source, /queued/);
  assert.match(source, /processing/);
  assert.match(source, /ready/);
  assert.match(source, /failed/);
  assert.match(source, /label.*status/s);

  assert.match(source, /border-red-200 bg-red-50 text-red-700/);
  assert.match(source, /border-orange-200 bg-orange-50 text-orange-700/);
  assert.match(source, /border-green-200 bg-green-50 text-green-700/);
});
