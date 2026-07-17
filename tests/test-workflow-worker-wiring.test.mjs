import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readBackendSource(relativePath) {
  return fs.readFileSync(path.join(rootDir, "apps/backend/src", relativePath), "utf8");
}

test("test workflow module starts and closes a BullMQ worker for queued runs", () => {
  const moduleSource = readBackendSource("test-workflows/test-workflows.module.ts");
  const workerSource = readBackendSource("test-workflows/runner/test-workflow-bullmq-worker.service.ts");

  assert.match(moduleSource, /TestWorkflowBullMqWorkerService/u);
  assert.match(workerSource, /new Worker<TestWorkflowJobData>/u);
  assert.match(workerSource, /runner\.process\(job\.data\)/u);
  assert.match(workerSource, /onModuleDestroy/u);
  assert.match(workerSource, /worker\?\.close\(\)/u);
});

test("test workflow runner uses the database clock for persisted timestamps", () => {
  const runnerSource = readBackendSource("test-workflows/runner/test-workflow-runner.service.ts");
  const storeSource = readBackendSource("test-workflows/runner/test-workflow-run-store.ts");

  assert.doesNotMatch(runnerSource, /markRunStatus\([^\n]+new Date\(\)\)/u);
  assert.doesNotMatch(runnerSource, /markStepStatus\([^\n]+new Date\(\)\)/u);
  assert.match(storeSource, /"startedAt" = COALESCE\("startedAt", NOW\(\)\)/u);
  assert.match(storeSource, /"finishedAt" = NOW\(\)/u);
});
