import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const diffEnginePath = new URL("../packages/diff-engine/dist/index.js", import.meta.url);
const oldSpecPath = new URL("../packages/diff-engine/fixtures/old.yaml", import.meta.url);
const breakingSpecPath = new URL("../packages/diff-engine/fixtures/breaking.yaml", import.meta.url);
const additiveSpecPath = new URL("../packages/diff-engine/fixtures/additive.yaml", import.meta.url);

async function runDiff(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [diffEnginePath.pathname, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("diff engine classifies removed endpoints, type changes, and required params as breaking", async () => {
  const result = await runDiff([
    "diff",
    "--base",
    oldSpecPath.pathname,
    "--revision",
    breakingSpecPath.pathname,
    "--format",
    "json",
  ]);

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.classification, "breaking");
  assert.equal(output.hasBreaking, true);
  assert.match(output.markdown, /Breaking changes/u);
  assert.ok(Array.isArray(output.diffJson.changes));
});

test("diff engine classifies additive optional changes as non-breaking", async () => {
  const result = await runDiff([
    "diff",
    "--base",
    oldSpecPath.pathname,
    "--revision",
    additiveSpecPath.pathname,
    "--format",
    "json",
  ]);

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.classification, "non-breaking");
  assert.equal(output.hasBreaking, false);
  assert.match(output.markdown, /Non-breaking changes/u);
  assert.ok(Array.isArray(output.diffJson.changes));
});

test("diff engine classifies unchanged specs as none", async () => {
  const result = await runDiff([
    "diff",
    "--base",
    oldSpecPath.pathname,
    "--revision",
    oldSpecPath.pathname,
    "--format",
    "json",
  ]);

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.classification, "none");
  assert.equal(output.hasBreaking, false);
  assert.deepEqual(output.diffJson.changes, []);
  assert.match(output.markdown, /No functional changes/u);
});
