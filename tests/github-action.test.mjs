import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";

const actionPath = new URL("../packages/github-action/dist/index.js", import.meta.url);
const fixturePath = new URL("./fixtures/openapi.yaml", import.meta.url);

function tempDir(name) {
  const path = join(tmpdir(), `bumd-${name}-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(path, { recursive: true });
  return path;
}

async function withServer(handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    await once(request, "end");
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ request, body });
    handler(request, response, body);
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

function writeEventFile(dir, payload) {
  const path = join(dir, "event.json");
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

function readOutputs(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  const outputs = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("<<")) {
      const markerIndex = line.indexOf("<<");
      const name = line.slice(0, markerIndex);
      const marker = line.slice(markerIndex + 2);
      const values = [];
      index += 1;
      while (index < lines.length && lines[index] !== marker) {
        values.push(lines[index]);
        index += 1;
      }
      outputs[name] = values.join("\n");
      continue;
    }
    if (line.includes("=")) {
      const equalsIndex = line.indexOf("=");
      outputs[line.slice(0, equalsIndex)] = line.slice(equalsIndex + 1);
    }
  }
  return outputs;
}

async function runAction(input) {
  if (input.env.GITHUB_OUTPUT !== undefined) {
    writeFileSync(input.env.GITHUB_OUTPUT, "");
  }
  const child = spawn(process.execPath, [actionPath.pathname], {
    env: { ...process.env, ...input.env },
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
  const [code] = await once(child, "close");
  return { code, stdout, stderr };
}

function baseEnv(input) {
  return {
    INPUT_COMMAND: input.command,
    INPUT_API_URL: input.apiUrl,
    INPUT_ORG: "acme",
    INPUT_DOC: "payments",
    INPUT_BRANCH: "main",
    INPUT_FILE: fixturePath.pathname,
    INPUT_BACKEND_TOKEN: "test_token_not_secret",
    INPUT_GITHUB_TOKEN: "test_github_token_not_secret",
    INPUT_FAIL_ON_BREAKING: input.failOnBreaking ?? "false",
    GITHUB_EVENT_NAME: input.eventName,
    GITHUB_EVENT_PATH: input.eventPath,
    GITHUB_OUTPUT: input.outputPath,
    GITHUB_REPOSITORY: "octo-org/octo-repo",
    GITHUB_API_URL: input.githubApiUrl ?? "https://api.github.invalid",
  };
}

test("github action deploy mode sends authenticated deploy request and sets public url output", async () => {
  const dir = tempDir("github-action-deploy");
  const outputPath = join(dir, "output");
  const backend = await withServer((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/orgs/acme/docs/payments/branches/main/deploys");
    assert.equal(request.headers.authorization, "Bearer test_token_not_secret");
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({
      skipped: false,
      version: { id: "ver_123", sha256: "server_sha", status: "queued" },
      job: { id: "job_123", status: "queued" },
    }));
  });

  try {
    const eventPath = writeEventFile(dir, { ref: "refs/heads/main" });
    const result = await runAction({
      env: baseEnv({ command: "deploy", apiUrl: backend.baseUrl, eventName: "push", eventPath, outputPath }),
    });

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(backend.requests.length, 1);
    const outputs = readOutputs(outputPath);
    assert.equal(outputs.version_id, "ver_123");
    assert.equal(outputs.job_id, "job_123");
    assert.equal(outputs.skipped, "false");
    assert.match(outputs.local_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(outputs.public_url, `${backend.baseUrl}/v1/orgs/acme/docs/payments/branches/main/versions/ver_123`);
    assert.equal(result.stdout.includes("test_token_not_secret"), false);
    assert.equal(result.stderr.includes("test_token_not_secret"), false);
  } finally {
    await backend.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("github action diff mode creates then updates one sticky PR comment", async () => {
  const dir = tempDir("github-action-diff");
  const comments = [];
  const backend = await withServer((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/orgs/acme/docs/payments/diffs/preview");
    assert.equal(request.headers.authorization, "Bearer test_token_not_secret");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      classification: "non_breaking",
      hasBreaking: false,
      markdown: "## Non-breaking changes\n\n- Added endpoint",
    }));
  });
  const githubApi = await withServer((request, response, body) => {
    if (request.method === "GET" && request.url === "/repos/octo-org/octo-repo/issues/42/comments") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(comments));
      return;
    }
    if (request.method === "POST" && request.url === "/repos/octo-org/octo-repo/issues/42/comments") {
      const parsed = JSON.parse(body);
      comments.push({ id: 1001, body: parsed.body, user: { type: "Bot" } });
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify(comments[0]));
      return;
    }
    if (request.method === "PATCH" && request.url === "/repos/octo-org/octo-repo/issues/comments/1001") {
      const parsed = JSON.parse(body);
      comments[0] = { ...comments[0], body: parsed.body };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(comments[0]));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  try {
    const eventPath = writeEventFile(dir, { pull_request: { number: 42 } });
    const firstOutputPath = join(dir, "first-output");
    const first = await runAction({
      env: baseEnv({
        command: "diff",
        apiUrl: backend.baseUrl,
        eventName: "pull_request",
        eventPath,
        outputPath: firstOutputPath,
        githubApiUrl: githubApi.baseUrl,
      }),
    });
    assert.equal(first.code, 0, `${first.stdout}\n${first.stderr}`);

    const secondOutputPath = join(dir, "second-output");
    const second = await runAction({
      env: baseEnv({
        command: "diff",
        apiUrl: backend.baseUrl,
        eventName: "pull_request",
        eventPath,
        outputPath: secondOutputPath,
        githubApiUrl: githubApi.baseUrl,
      }),
    });
    assert.equal(second.code, 0, `${second.stdout}\n${second.stderr}`);

    assert.equal(comments.length, 1);
    assert.match(comments[0].body, /<!-- bumd-diff-comment -->/u);
    assert.match(comments[0].body, /Non-breaking changes/u);
    const createCalls = githubApi.requests.filter((entry) => entry.request.method === "POST").length;
    const updateCalls = githubApi.requests.filter((entry) => entry.request.method === "PATCH").length;
    assert.equal(createCalls, 1);
    assert.equal(updateCalls, 1);
    assert.equal(readOutputs(firstOutputPath).comment_id, "1001");
    assert.equal(readOutputs(secondOutputPath).comment_id, "1001");
    assert.equal(first.stdout.includes("test_token_not_secret"), false);
    assert.equal(second.stderr.includes("test_token_not_secret"), false);
  } finally {
    await backend.close();
    await githubApi.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("github action diff mode fails only when fail_on_breaking is true and backend has breaking changes", async () => {
  const dir = tempDir("github-action-breaking");
  const comments = [];
  const backend = await withServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      classification: "breaking",
      hasBreaking: true,
      markdown: "## Breaking changes\n\n- Removed endpoint",
    }));
  });
  const githubApi = await withServer((request, response, body) => {
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(comments));
      return;
    }
    if (request.method === "POST") {
      const parsed = JSON.parse(body);
      comments.push({ id: 2002, body: parsed.body, user: { type: "Bot" } });
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify(comments[0]));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  try {
    const eventPath = writeEventFile(dir, { pull_request: { number: 42 } });
    const passingOutput = join(dir, "passing-output");
    const passing = await runAction({
      env: baseEnv({
        command: "diff",
        apiUrl: backend.baseUrl,
        eventName: "pull_request",
        eventPath,
        outputPath: passingOutput,
        githubApiUrl: githubApi.baseUrl,
        failOnBreaking: "false",
      }),
    });
    assert.equal(passing.code, 0, `${passing.stdout}\n${passing.stderr}`);

    const failingOutput = join(dir, "failing-output");
    const failing = await runAction({
      env: baseEnv({
        command: "diff",
        apiUrl: backend.baseUrl,
        eventName: "pull_request",
        eventPath,
        outputPath: failingOutput,
        githubApiUrl: githubApi.baseUrl,
        failOnBreaking: "true",
      }),
    });
    assert.notEqual(failing.code, 0);
    assert.equal(readOutputs(passingOutput).has_breaking, "true");
    assert.equal(readOutputs(failingOutput).has_breaking, "true");
    assert.equal(comments.length, 1);
    assert.match(comments[0].body, /Breaking changes/u);
  } finally {
    await backend.close();
    await githubApi.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("github action masks tokens and never writes backend token to stdout or stderr", async () => {
  const dir = tempDir("github-action-secret");
  const outputPath = join(dir, "output");
  const backend = await withServer((_request, response) => {
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({
      skipped: false,
      version: { id: "ver_secret", sha256: "server_sha", status: "queued" },
      job: { id: "job_secret", status: "queued" },
    }));
  });

  try {
    const eventPath = writeEventFile(dir, { ref: "refs/heads/main" });
    const result = await runAction({
      env: baseEnv({ command: "deploy", apiUrl: backend.baseUrl, eventName: "push", eventPath, outputPath }),
    });

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout.includes("test_token_not_secret"), false);
    assert.equal(result.stderr.includes("test_token_not_secret"), false);
    assert.equal(readFileSync(outputPath, "utf8").includes("test_token_not_secret"), false);
  } finally {
    await backend.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
