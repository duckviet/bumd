import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";

const cliPath = new URL("../apps/cli/dist/index.js", import.meta.url);
const fixturePath = new URL("./fixtures/openapi.yaml", import.meta.url);

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath.pathname, ...args], {
      env: { ...process.env, ...env },
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

async function withServer(handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    await once(request, "end");
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ request, body });
    handler(request, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("deploy command posts base64 spec with bearer auth and prints structured JSON", async () => {
  const server = await withServer((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/orgs/acme/docs/payments/branches/main/deploys");
    assert.equal(request.headers.authorization, "Token test_token_not_secret");
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({
      skipped: false,
      version: { id: "ver_123", sha256: "server_sha", status: "queued" },
      job: { id: "job_123", status: "queued" },
    }));
  });

  try {
    const result = await runCli([
      "deploy",
      "--api-url", server.baseUrl,
      "--org", "acme",
      "--doc", "payments",
      "--branch", "main",
      "--file", fixturePath.pathname,
      "--json",
    ], { BUMD_API_TOKEN: "test_token_not_secret" });

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.skipped, false);
    assert.equal(output.version.id, "ver_123");
    assert.match(output.localSha256, /^[a-f0-9]{64}$/u);
    assert.equal(result.stdout.includes("test_token_not_secret"), false);
    assert.equal(result.stderr.includes("test_token_not_secret"), false);
    assert.equal(server.requests.length, 1);
    const body = JSON.parse(server.requests[0].body);
    assert.equal(body.filename, "openapi.yaml");
    assert.equal(body.sourceFormat, "openapi");
    assert.equal(Buffer.from(body.specBase64, "base64").toString("utf8"), readFileSync(fixturePath, "utf8"));
  } finally {
    await server.close();
  }
});

test("deploy command prints skipped response for unchanged backend deploy", async () => {
  const server = await withServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      skipped: true,
      version: { id: "ver_existing", sha256: "server_sha", status: "ready" },
    }));
  });

  try {
    const result = await runCli([
      "deploy",
      "--api-url", server.baseUrl,
      "--org", "acme",
      "--doc", "payments",
      "--branch", "main",
      "--file", fixturePath.pathname,
      "--json",
    ], { BUMD_API_TOKEN: "test_token_not_secret" });

    assert.equal(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.skipped, true);
    assert.equal(output.version.id, "ver_existing");
  } finally {
    await server.close();
  }
});

test("deploy command rejects missing token before contacting API", async () => {
  const tempDir = join(tmpdir(), `bumd-cli-${process.pid}`);
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  const marker = join(tempDir, "contacted");

  const server = await withServer((_request, response) => {
    writeFileSync(marker, "contacted");
    response.writeHead(500);
    response.end();
  });

  try {
    const result = await runCli([
      "deploy",
      "--api-url", server.baseUrl,
      "--org", "acme",
      "--doc", "payments",
      "--branch", "main",
      "--file", fixturePath.pathname,
    ], { BUMD_API_TOKEN: "" });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /BUMD_API_TOKEN/u);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
