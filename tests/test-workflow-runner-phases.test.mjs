import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".js") && context.parentURL?.includes("/apps/backend/src/")) {
      const sourceUrl = new URL(specifier.replace(/\.js$/u, ".ts"), context.parentURL);
      if (existsSync(fileURLToPath(sourceUrl))) {
        return { shortCircuit: true, url: sourceUrl.href };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url.endsWith(".ts") && loaded.source !== null && loaded.source !== undefined) {
      const source = typeof loaded.source === "string"
        ? loaded.source
        : Buffer.from(loaded.source).toString("utf8");
      return {
        ...loaded,
        source: stripTypeScriptTypes(source, { mode: "transform", sourceMap: true }),
      };
    }
    return loaded;
  },
});

const { buildTopologicalOrder, getDescendants } = await import(
  "../apps/backend/src/test-workflows/runner/test-workflow-graph.ts"
);

test("characterizes deterministic topological order and descendant fail-fast scope", () => {
  // Given
  const nodes = ["setup", "primary", "child", "independent", "cleanup"];
  const edges = [
    { source: "setup", target: "primary" },
    { source: "primary", target: "child" },
    { source: "setup", target: "cleanup" },
  ];

  // When
  const order = buildTopologicalOrder(nodes, edges);
  const descendants = getDescendants("primary", edges);

  // Then
  assert.deepEqual(order, ["setup", "independent", "primary", "cleanup", "child"]);
  assert.deepEqual([...descendants], ["child"]);
  assert.equal(descendants.has("independent"), false);
});

test("executes setup, tests, and teardown with failure and cancellation precedence", () => {
  // Given / When
  const result = spawnSync(
    process.execPath,
    [
      "--env-file=.env",
      "--loader",
      "./tests/fixtures/typescript-source-loader.mjs",
      "./tests/fixtures/test-workflow-runner-phases-live.mjs",
    ],
    { cwd: process.cwd(), encoding: "utf8", env: process.env, timeout: 30_000 },
  );

  // Then
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const observable = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.deepEqual(observable.happy.calls.map((call) => call.path), [
    "/setup",
    "/request/resource-123",
    "/cleanup/resource-123",
  ]);
  assert.equal(observable.happy.run.status, "succeeded");
  assert.equal(observable.happy.terminalReplaySkipped, true);
  assert.deepEqual(observable.happy.steps.map((step) => step.phase), ["setup", "test", "teardown"]);
  assert.equal(observable.happy.steps[1].inputsJson.some((input) => input.type === "data"), true);
  assert.equal(observable.happy.steps[0].exportsJson.reflectedSecret, "Bearer [REDACTED]");
  assert.equal(observable.happy.steps[1].inputsJson.find((input) => input.name === "reflectedSecret").value, "Bearer [REDACTED]");
  assert.equal(observable.happy.steps[1].inputsJson.find((input) => input.name === "resourceId").value, "resource-123");
  assert.equal(observable.happy.calls[1].consumedSecretVar, true);
  assert.equal(observable.happy.calls[1].query.expected, "saved-data");
  assert.equal(observable.happy.calls[1].usedSnapshot, true);

  assert.deepEqual(
    Object.fromEntries(observable.setupFailure.steps.map((step) => [step.nodeId, step.status])),
    { "setup-fail": "failed", "test-independent": "skipped", "cleanup-fail": "failed", cleanup: "succeeded" },
  );
  assert.equal(observable.setupFailure.run.errorCode, "RUN_FAILED");
  assert.equal(
    observable.setupFailure.steps.find((step) => step.nodeId === "cleanup-fail").status,
    "failed",
  );

  assert.deepEqual(
    Object.fromEntries(observable.testFailure.steps.map((step) => [step.nodeId, step.status])),
    { "test-fail": "failed", child: "skipped", independent: "succeeded", cleanup: "succeeded" },
  );
  assert.equal(observable.testFailure.run.errorCode, "RUN_FAILED");

  assert.deepEqual(observable.teardownFailure.calls.map((call) => call.path), [
    "/test-ok",
    "/teardown-ok",
  ]);
  assert.equal(observable.teardownFailure.run.errorCode, "TEARDOWN_FAILED");
  assert.equal(
    observable.teardownFailure.steps.find((step) => step.nodeId === "teardown-fail").errorCode,
    "VAR_REF_INVALID",
  );
  assert.equal(observable.canceled.run.status, "canceled");
  assert.deepEqual(observable.canceled.calls.map((call) => call.path), ["/setup", "/teardown-fail"]);
  assert.equal(observable.canceled.run.durationMs >= 0, true);
  assert.equal(
    observable.canceled.steps.find((step) => step.nodeId === "cleanup").status,
    "failed",
  );
  assert.equal(observable.teardownCanceled.run.status, "canceled");
  assert.deepEqual(observable.teardownCanceled.calls.map((call) => call.path), ["/test", "/teardown-cancel", "/teardown-after"]);
  assert.equal(observable.legacy.calls[0].usedLegacy, true);

  const persisted = JSON.stringify(observable);
  assert.doesNotMatch(persisted, /snapshot_token_not_secret/u);
  assert.doesNotMatch(persisted, /legacy_live_value/u);
  assert.doesNotMatch(result.stdout, /snapshot_token_not_secret/u);
  assert.doesNotMatch(result.stdout, /legacy_live_value/u);
  assert.doesNotMatch(result.stderr, /snapshot_token_not_secret/u);
  assert.doesNotMatch(result.stderr, /legacy_live_value/u);
});
