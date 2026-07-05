import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import { test } from "node:test";

const cliPath = new URL("../apps/cli/dist/index.js", import.meta.url);

test("versions command lists branch versions with bearer auth", async () => {
  const requests = [];
  const server = await createServer((request, response) => {
    requests.push(request);
    assert.equal(request.url, "/v1/orgs/acme/docs/payments/branches/main/versions");
    assert.equal(request.headers.authorization, "Bearer test_token_not_secret");

    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        versions: [
          { id: "ver_2", status: "ready", sha256: "def456" },
          { id: "ver_1", status: "ready", sha256: "abc123" },
        ],
      }),
    );
  });

  try {
    const result = await runCli([
      "versions",
      "--api-url",
      server.url,
      "--org",
      "acme",
      "--doc",
      "payments",
      "--branch",
      "main",
      "--json",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      versions: [
        { id: "ver_2", status: "ready", sha256: "def456" },
        { id: "ver_1", status: "ready", sha256: "abc123" },
      ],
    });
    assert.equal(requests.length, 1);
  } finally {
    await server.close();
  }
});

test("status command prints a deployed version status", async () => {
  const server = await createServer((request, response) => {
    assert.equal(request.url, "/v1/orgs/acme/docs/payments/branches/main/versions/ver_1");

    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ id: "ver_1", status: "processing", sha256: "abc123" }));
  });

  try {
    const result = await runCli([
      "status",
      "--api-url",
      server.url,
      "--org",
      "acme",
      "--doc",
      "payments",
      "--branch",
      "main",
      "--version",
      "ver_1",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ver_1 processing abc123/u);
  } finally {
    await server.close();
  }
});

test("status command prints a deploy job status", async () => {
  const server = await createServer((request, response) => {
    assert.equal(request.url, "/v1/orgs/acme/jobs/job_123");

    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        id: "job_123",
        type: "diff",
        status: "queued",
        versionId: "ver_1",
        docId: "doc_payments",
        branchId: "br_payments_main",
        attemptCount: 0,
        error: null,
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      }),
    );
  });

  try {
    const result = await runCli(["status", "job_123", "--api-url", server.url, "--org", "acme"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /job_123 queued diff/u);
  } finally {
    await server.close();
  }
});

test("diff command exits 2 for breaking diffs when requested", async () => {
  const server = await createServer((request, response) => {
    assert.equal(request.url, "/v1/orgs/acme/docs/payments/branches/main/versions/ver_2/diff");

    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        versionId: "ver_2",
        classification: "breaking",
        hasBreaking: true,
        diffMarkdown: "## Breaking changes\n\n- Removed GET /payments",
      }),
    );
  });

  try {
    const result = await runCli([
      "diff",
      "--api-url",
      server.url,
      "--org",
      "acme",
      "--doc",
      "payments",
      "--branch",
      "main",
      "--version",
      "ver_2",
      "--fail-on-breaking",
    ]);

    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout, /Removed GET \/payments/u);
  } finally {
    await server.close();
  }
});

test("init writes project config and versions uses it by default", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "bumd-cli-project-"));
  const server = await createServer((request, response) => {
    assert.equal(request.url, "/v1/orgs/acme/docs/payments/branches/main/versions");

    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ versions: [{ id: "ver_1", status: "ready", sha256: "abc123" }] }));
  });

  try {
    const initResult = await runCli(
      [
        "init",
        "--api-url",
        server.url,
        "--app-url",
        "https://docs.example.com",
        "--org",
        "acme",
        "--doc",
        "payments",
        "--branch",
        "main",
      ],
      { cwd },
    );

    assert.equal(initResult.status, 0, initResult.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(cwd, ".bumd.json"), "utf8")), {
      apiUrl: server.url,
      appUrl: "https://docs.example.com",
      org: "acme",
      doc: "payments",
      branch: "main",
    });

    const versionsResult = await runCli(["versions", "--json"], { cwd });

    assert.equal(versionsResult.status, 0, versionsResult.stderr);
    assert.deepEqual(JSON.parse(versionsResult.stdout), {
      versions: [{ id: "ver_1", status: "ready", sha256: "abc123" }],
    });
  } finally {
    await server.close();
  }
});

test("docs open prints the configured public docs URL", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "bumd-cli-project-"));
  const initResult = await runCli(
    [
      "init",
      "--api-url",
      "https://api.example.com",
      "--app-url",
      "https://docs.example.com",
      "--org",
      "acme",
      "--doc",
      "payments",
      "--branch",
      "main",
    ],
    { cwd },
  );

  assert.equal(initResult.status, 0, initResult.stderr);

  const openResult = await runCli(["docs:open", "--json"], { cwd });

  assert.equal(openResult.status, 0, openResult.stderr);
  assert.deepEqual(JSON.parse(openResult.stdout), {
    url: "https://docs.example.com/acme/payments/main",
  });
});

function runCli(args, options = {}) {
  const child = spawn(process.execPath, [cliPath.pathname, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      BUMD_API_TOKEN: "test_token_not_secret",
      XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "bumd-cli-test-")),
    },
    encoding: "utf8",
  });

  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function createServer(handler) {
  const server = http.createServer(handler);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Expected TCP test server address"));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          }),
      });
    });
  });
}
