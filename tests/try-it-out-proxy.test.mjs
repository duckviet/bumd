import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

const HOST = "127.0.0.1";

async function createHarness() {
  const module = await import("../apps/backend/dist/testing/create-test-server.js");
  return module.createTestServer();
}

async function issueToken(harness) {
  const token = await harness.issueApiToken({
    organizationId: "acme",
    name: "ci",
    role: "member",
    scopes: ["docs:deploy"],
  });
  return token.token;
}

function specBase64(spec) {
  return Buffer.from(JSON.stringify(spec)).toString("base64");
}

async function deployReadyVersion(harness, token, spec) {
  const response = await harness.inject({
    method: "POST",
    url: "/v1/versions",
    headers: { Authorization: `Token ${token}` },
    payload: {
      orgSlug: "acme",
      docSlug: "payments",
      branchSlug: "main",
      filename: "openapi.json",
      sourceFormat: "openapi",
      specBase64: specBase64(spec),
    },
  });

  assert.equal(response.statusCode, 202);
  const body = JSON.parse(response.payload);
  await harness.processDeployJobs();
  return body.version.id;
}

async function withUpstream(callback) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    if (request.url?.startsWith("/redirect") === true) {
      response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
      response.end();
      return;
    }
    response.writeHead(201, {
      "content-type": "application/json",
      "x-upstream-response": "kept",
      "set-cookie": "secret=session",
    });
    response.end(JSON.stringify({ ok: true, method: request.method, url: request.url }));
  });
  server.listen(0, HOST);
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);

  try {
    await callback({ baseUrl: `http://${HOST}:${address.port}`, requests });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("proxy forwards only to spec-declared server host", async () => {
  const previousAllowedHosts = process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"];
  process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"] = HOST;
  const harness = await createHarness();

  try {
    const token = await issueToken(harness);
    await withUpstream(async (upstream) => {
      const versionId = await deployReadyVersion(harness, token, {
        openapi: "3.1.0",
        info: { title: "Payments", version: "1.0.0" },
        servers: [{ url: upstream.baseUrl }],
        paths: {
          "/payments": {
            get: {
              operationId: "listPayments",
              responses: { "200": { description: "ok" } },
            },
          },
        },
      });

      const response = await harness.inject({
        method: "POST",
        url: `/v1/orgs/acme/docs/payments/branches/main/versions/${versionId}/try-it-out`,
        payload: {
          serverUrl: upstream.baseUrl,
          method: "GET",
          path: "/payments",
          query: { customerId: "cus_123" },
          headers: { "x-client-request": "allowed" },
        },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.status, 201);
      assert.equal(body.headers["x-upstream-response"], "kept");
      assert.equal(body.headers["set-cookie"], undefined);
      assert.match(body.body, /cus_123/u);
      assert.equal(upstream.requests.length, 1);
      assert.equal(upstream.requests[0].headers["x-client-request"], "allowed");
    });
  } finally {
    if (previousAllowedHosts === undefined) {
      delete process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"];
    } else {
      process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"] = previousAllowedHosts;
    }
    await harness.close();
  }
});

test("proxy rejects localhost private and metadata hosts", async () => {
  const previousAllowedHosts = process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"];
  delete process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"];
  const harness = await createHarness();

  try {
    const token = await issueToken(harness);
    const versionId = await deployReadyVersion(harness, token, {
      openapi: "3.1.0",
      info: { title: "Payments", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/payments": {
          get: {
            operationId: "listPayments",
            responses: { "200": { description: "ok" } },
          },
        },
      },
    });

    for (const serverUrl of ["http://127.0.0.1:4444", "http://localhost:4444", "http://169.254.169.254"]) {
      const response = await harness.inject({
        method: "POST",
        url: `/v1/orgs/acme/docs/payments/branches/main/versions/${versionId}/try-it-out`,
        payload: {
          serverUrl,
          method: "GET",
          path: "/payments",
        },
      });

      assert.equal(response.statusCode, 403, `expected ${serverUrl} to be blocked`);
      assert.equal(JSON.parse(response.payload).error.code, "try_it_out_target_forbidden");
    }
  } finally {
    if (previousAllowedHosts === undefined) {
      delete process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"];
    } else {
      process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"] = previousAllowedHosts;
    }
    await harness.close();
  }
});

test("proxy does not follow upstream redirects to forbidden hosts", async () => {
  const previousAllowedHosts = process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"];
  process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"] = HOST;
  const harness = await createHarness();

  try {
    const token = await issueToken(harness);
    await withUpstream(async (upstream) => {
      const versionId = await deployReadyVersion(harness, token, {
        openapi: "3.1.0",
        info: { title: "Payments", version: "1.0.0" },
        servers: [{ url: upstream.baseUrl }],
        paths: {
          "/redirect": {
            get: {
              operationId: "redirectToMetadata",
              responses: { "302": { description: "redirect" } },
            },
          },
        },
      });

      const response = await harness.inject({
        method: "POST",
        url: `/v1/orgs/acme/docs/payments/branches/main/versions/${versionId}/try-it-out`,
        payload: {
          serverUrl: upstream.baseUrl,
          method: "GET",
          path: "/redirect",
        },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.status, 302);
      assert.equal(upstream.requests.length, 1);
    });
  } finally {
    if (previousAllowedHosts === undefined) {
      delete process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"];
    } else {
      process.env["BUMD_TRY_PROXY_ALLOWED_HOSTS"] = previousAllowedHosts;
    }
    await harness.close();
  }
});
