import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { parse as parseYaml } from "yaml";

const HOST = "127.0.0.1";
const FRONTEND_STARTUP_TIMEOUT_MS = 15_000;

const paymentSpecV1 = parseYaml(readFileSync(new URL("./fixtures/payments-v1.openapi.yaml", import.meta.url), "utf8"));
const paymentSpecV2 = parseYaml(readFileSync(new URL("./fixtures/payments-v2.openapi.yaml", import.meta.url), "utf8"));
const legacyPaymentSpecFixture = {
  openapi: "3.1.0",
  info: { title: "Payments API", version: "1.0.0" },
  servers: [{ url: "https://api.example.test" }],
  paths: {
    "/payments": {
      post: {
        operationId: "createPayment",
        parameters: [
          {
            name: "customerId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Created payment",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Payment" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Payment: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
      },
    },
  },
};

const privateSpec = {
  openapi: "3.1.0",
  info: { title: "Private API", version: "1.0.0" },
  paths: {
    "/private": {
      get: {
        operationId: "privateOperation",
        responses: { "200": { description: "Hidden private response string" } },
      },
    },
  },
};

function json(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function withMockBackend() {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });

    if (request.url === undefined) {
      json(response, 405, { error: { code: "method_not_allowed" } });
      return;
    }

    if (request.method === "POST" && request.url === "/v1/orgs/acme/docs/payments/branches/main/versions/ver_ready_003/try-it-out") {
      json(response, 200, {
        status: 202,
        headers: { "content-type": "application/json" },
        body: "{\"proxied\":true}",
      });
      return;
    }

    if (request.method !== "GET") {
      json(response, 405, { error: { code: "method_not_allowed" } });
      return;
    }

    const url = new URL(request.url, "http://backend.test");

    switch (url.pathname) {
      case "/v1/orgs/acme/docs/payments":
        json(response, 200, {
          slug: "payments",
          name: "Payments API",
          visibility: "public",
          defaultBranchSlug: "main",
        });
        return;
      case "/v1/orgs/acme/docs/payments/branches/main/versions/latest-ready":
        json(response, 200, {
          id: "ver_ready_003",
          branchSlug: "main",
          sequenceNumber: 3,
          readyAt: "2026-06-04T12:00:00.000Z",
          spec: paymentSpecV2,
        });
        return;
      case "/v1/orgs/acme/docs/payments/changes":
        json(response, 200, [
          {
            id: "diff_new",
            title: "Added payments endpoint",
            createdAt: "2026-06-04T12:00:00.000Z",
            hasBreaking: true,
          },
          {
            id: "diff_old",
            title: "Initial release",
            createdAt: "2026-06-01T12:00:00.000Z",
            hasBreaking: false,
          },
        ]);
        return;
      case "/v1/orgs/acme/docs/payments/changes/diff_new":
        json(response, 200, {
          id: "diff_new",
          diffMarkdown: [
            "## Added operations",
            "- POST /refunds was added",
            "",
            "## Changed operations",
            "- GET /payments added optional response field receiptUrl",
          ].join("\n"),
        });
        return;
      case "/v1/orgs/acme/docs/payments/search":
        assert.equal(request.headers.authorization, "Token frontend_search_token");
        json(response, 200, {
          hits: [
            {
              operationId: "createPayment",
              method: "POST",
              path: "/payments",
              tags: ["payments"],
              summary: "Create a payment",
              description: "Creates a payment for a customer.",
              anchor: "operation-createPayment",
            },
          ],
        });
        return;
      case "/v1/orgs/acme/docs/private-doc":
        json(response, 200, {
          slug: "private-doc",
          name: "Private API",
          visibility: "private",
          defaultBranchSlug: "main",
        });
        return;
      case "/v1/orgs/acme/docs/private-doc/branches/main/versions/latest-ready":
        json(response, 200, {
          id: "ver_private_001",
          branchSlug: "main",
          sequenceNumber: 1,
          readyAt: "2026-06-04T12:00:00.000Z",
          spec: privateSpec,
        });
        return;
      case "/v1/orgs/acme/docs/empty":
        json(response, 200, {
          slug: "empty",
          name: "Empty API",
          visibility: "public",
          defaultBranchSlug: "main",
        });
        return;
      case "/v1/orgs/acme/docs/empty/branches/main/versions/latest-ready":
        json(response, 200, { version: null });
        return;
      default:
        json(response, 404, { error: { code: "not_found", path: url.pathname } });
    }
  });

  server.listen(0, HOST);
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);

  return {
    baseUrl: `http://${HOST}:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function getOpenPort() {
  const server = createServer();
  server.listen(0, HOST);
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function startFrontend(port, backendUrl) {
  const child = spawn(
    "pnpm",
    ["--filter", "@bumd/frontend", "start", "--hostname", HOST, "--port", String(port)],
    {
      cwd: new URL("..", import.meta.url),
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        BUMD_BACKEND_URL: backendUrl,
        BUMD_BACKEND_API_TOKEN: "frontend_search_token",
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return {
    baseUrl: `http://${HOST}:${port}`,
    stop: () => stopChild(child),
    waitUntilReady: () => waitUntilReady(child, `http://${HOST}:${port}`, () => ({ stdout, stderr })),
  };
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  signalChildTree(child, "SIGTERM");
  await Promise.race([
    once(child, "close"),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    signalChildTree(child, "SIGKILL");
    await once(child, "close");
  }
}

function signalChildTree(child, signal) {
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return;
    }
    throw error;
  }
}

async function waitUntilReady(child, baseUrl, getOutput) {
  const deadline = Date.now() + FRONTEND_STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const { stdout, stderr } = getOutput();
      throw new Error(
        `@bumd/frontend dev exited before startup with code ${child.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      );
    }

    try {
      await fetch(baseUrl, { redirect: "manual" });
      await new Promise((resolve) => setTimeout(resolve, 500));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  const { stdout, stderr } = getOutput();
  throw new Error(
    `Timed out waiting for @bumd/frontend dev at ${baseUrl}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
}

async function withFrontend(backendUrl, callback) {
  const port = await getOpenPort();
  const frontend = startFrontend(port, backendUrl);
  try {
    await frontend.waitUntilReady();
    await callback(frontend.baseUrl);
  } finally {
    await frontend.stop();
  }
}

async function fetchText(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
  });
  return {
    response,
    body: await response.text(),
  };
}

test("frontend renders ready public doc operations params schemas and operation anchors", async () => {
  const backend = await withMockBackend();

  try {
    await withFrontend(backend.baseUrl, async (baseUrl) => {
      const { response, body } = await fetchText(baseUrl, "/acme/payments");

      assert.equal(response.status, 200);
      assert.match(body, /Navigation/u);
      assert.match(body, /Content/u);
      assert.match(body, /Schemas/u);
      assert.match(body, /createPayment/u);
      assert.match(body, /customerId/u);
      assert.match(body, /Payment/u);
      assert.match(body, /(?:id|href)=["']#?operation-createPayment["']/u);
    });
  } finally {
    await backend.close();
  }
});

test("frontend renders scoped search and try it out proxy controls", async () => {
  const backend = await withMockBackend();
  const targetRequests = [];
  const target = createServer((request, response) => {
    targetRequests.push({ method: request.method, url: request.url });
    json(response, 200, { direct: true });
  });
  target.listen(0, HOST);
  await once(target, "listening");

  try {
    await withFrontend(backend.baseUrl, async (baseUrl) => {
      const page = await fetchText(baseUrl, "/acme/payments");

      assert.equal(page.response.status, 200);
      assert.match(page.body, /data-testid="doc-search"/u);
      assert.match(page.body, /name="q"/u);
      assert.match(page.body, /createPayment/u);
      assert.match(page.body, /createRefund/u);
      assert.match(page.body, /data-testid="try-it-out-panel"/u);
      assert.match(page.body, /\/api\/try-it-out/u);
      assert.doesNotMatch(page.body, /https:\/\/api\.example\.test\/payments/u);

      const search = await fetchText(baseUrl, "/api/search?orgSlug=acme&docSlug=payments&q=createPayment");
      assert.equal(search.response.status, 200);
      assert.match(search.body, /createPayment/u);
      assert.match(search.body, /operation-createPayment/u);

      const proxy = await fetchText(baseUrl, "/api/try-it-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgSlug: "acme",
          docSlug: "payments",
          branchSlug: "main",
          versionId: "ver_ready_003",
          serverUrl: "https://api.example.test",
          method: "POST",
          path: "/payments",
        }),
      });
      assert.equal(proxy.response.status, 200);
      assert.match(proxy.body, /proxied/u);
      assert.equal(targetRequests.length, 0, "frontend must not call the target API directly");
    });
  } finally {
    await new Promise((resolve) => target.close(resolve));
    await backend.close();
  }
});

test("frontend changelog pages list newest first and render stored diff markdown", async () => {
  const backend = await withMockBackend();

  try {
    await withFrontend(backend.baseUrl, async (baseUrl) => {
      const list = await fetchText(baseUrl, "/acme/payments/changes");

      assert.equal(list.response.status, 200);
      assert.ok(
        list.body.indexOf("Added payments endpoint") < list.body.indexOf("Initial release"),
        "expected newer changelog entry to render before older entry",
      );
      assert.match(list.body, /breaking/i);

      const detail = await fetchText(baseUrl, "/acme/payments/changes/diff_new");
      assert.equal(detail.response.status, 200);
      assert.match(detail.body, /Added operations/u);
      assert.match(detail.body, /Changed operations/u);
      assert.match(detail.body, /POST \/refunds was added/u);
      assert.match(detail.body, /receiptUrl/u);
    });
  } finally {
    await backend.close();
  }
});

test("frontend blocks private doc without leaking spec and shows empty state for no ready version", async () => {
  const backend = await withMockBackend();

  try {
    await withFrontend(backend.baseUrl, async (baseUrl) => {
      const privatePage = await fetchText(baseUrl, "/acme/private-doc");

      assert.ok(
        privatePage.response.status === 401
          || (privatePage.response.status >= 300 && privatePage.response.status < 400),
        `expected private doc to redirect or return 401, got ${privatePage.response.status}`,
      );
      assert.equal(privatePage.body.includes("privateOperation"), false);
      assert.equal(privatePage.body.includes("Hidden private response string"), false);

      const emptyPage = await fetchText(baseUrl, "/acme/empty");
      assert.equal(emptyPage.response.status, 200);
      assert.match(emptyPage.body, /no ready version|no published version|no documentation available|empty/i);
    });
  } finally {
    await backend.close();
  }
});
