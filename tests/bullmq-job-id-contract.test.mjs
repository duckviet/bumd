import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readBackendSource(relativePath) {
  return fs.readFileSync(path.join(rootDir, "apps/backend/src", relativePath), "utf8");
}

test("BullMQ custom job IDs use deterministic colon-free formats", () => {
  const deployQueueSource = readBackendSource("versions/bullmq-deploy-queue.ts");
  const workflowRunsSource = readBackendSource("test-workflows/test-workflow-runs.service.ts");
  const webhookQueueSource = readBackendSource("webhooks/bullmq-webhook-queue.ts");

  assert.match(deployQueueSource, /jobId: `version-\$\{data\.versionId\}-parse`/u);
  assert.match(workflowRunsSource, /jobId: `test-workflow-\$\{data\.runId\}`/u);
  assert.match(
    webhookQueueSource,
    /jobId: `webhook-\$\{input\.job\.event\.id\}-\$\{input\.job\.webhookId\}-\$\{input\.job\.attemptNumber\}`/u,
  );
});
