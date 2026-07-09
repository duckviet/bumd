import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";

test("github action exchanges GitHub OIDC for a deploy-scoped backend token", async () => {
  const workspace = tempDir("github-action-oidc");
  const outputPath = join(workspace, "output");
  const specPath = join(workspace, "openapi.yaml");
  writeFileSync(outputPath, "");
  writeFileSync(
    specPath,
    [
      "openapi: 3.0.0",
      "info:",
      "  title: OIDC Action Test",
      "  version: 1.0.0",
      "paths: {}",
      "",
    ].join("\n"),
  );

  const oidcRequests = [];
  const deployRequests = [];
  const oidcServer = await withServer(async (request, body, response) => {
    oidcRequests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body,
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ value: "test_github_oidc_jwt_not_secret" }));
  });

  const backendServer = await withServer(async (request, body, response) => {
    deployRequests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body,
    });
    if (request.url === "/v1/auth/github/oidc-token") {
      const payload = JSON.parse(body);
      assert.equal(payload.token, "test_github_oidc_jwt_not_secret");
      assert.equal(payload.organizationSlug, "acme");
      assert.equal(payload.repository, "octo/repo");
      assert.equal(payload.ref, "refs/heads/main");
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ token: "test_backend_token_not_secret" }));
      return;
    }
    assert.equal(request.headers.authorization, "Bearer test_backend_token_not_secret");
    response.writeHead(202, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        version: { id: "ver_oidc", sha256: "server_sha", status: "queued" },
        job: { id: "job_oidc", status: "queued" },
        skipped: false,
      }),
    );
  });

  try {
    const result = await runAction({
      env: {
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test_actions_request_token",
        ACTIONS_ID_TOKEN_REQUEST_URL: `${oidcServer.url}?request=1`,
        GITHUB_ACTIONS: "true",
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: "octo/repo",
        GITHUB_OUTPUT: outputPath,
        INPUT_AUTH_MODE: "oidc",
        INPUT_COMMAND: "deploy",
        INPUT_API_URL: backendServer.url,
        INPUT_ORG: "acme",
        INPUT_DOC: "payments",
        INPUT_BRANCH: "main",
        INPUT_FILE: specPath,
      },
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(oidcRequests.length, 1);
    assert.equal(oidcRequests[0].method, "GET");
    assert.match(oidcRequests[0].url, /audience=bumd/u);
    assert.equal(oidcRequests[0].authorization?.toLowerCase(), "bearer test_actions_request_token");
    assert.equal(deployRequests.length, 2, JSON.stringify(deployRequests));
    const exchangeRequest = deployRequests.find((request) => request.url === "/v1/auth/github/oidc-token");
    const deployRequest = deployRequests.find((request) =>
      /\/v1\/orgs\/acme\/docs\/payments\/branches\/main\/deploys/u.test(request.url),
    );
    assert.notEqual(exchangeRequest, undefined);
    assert.notEqual(deployRequest, undefined);
    const outputs = readActionOutputs(outputPath);
    assert.equal(outputs.version_id, "ver_oidc");
    assert.equal(outputs.job_id, "job_oidc");
  } finally {
    await backendServer.close();
    await oidcServer.close();
    rmSync(workspace, { recursive: true, force: true });
  }
});

function tempDir(name) {
  const dir = join(process.cwd(), ".tmp", `${name}-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function withServer(handler) {
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    await handler(request, body, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function runAction(input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["packages/github-action/lib/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...input.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function readActionOutputs(path) {
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const outputs = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const delimiterIndex = line.indexOf("<<");
    if (delimiterIndex === -1) {
      const [key, value] = line.split("=");
      outputs[key] = value;
      continue;
    }
    const key = line.slice(0, delimiterIndex);
    const delimiter = line.slice(delimiterIndex + 2);
    const values = [];
    index += 1;
    while (index < lines.length && lines[index] !== delimiter) {
      values.push(lines[index]);
      index += 1;
    }
    outputs[key] = values.join("\n");
  }
  return outputs;
}
