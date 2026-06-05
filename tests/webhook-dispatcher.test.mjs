import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

async function createHarness() {
  const module = await import("../apps/backend/dist/testing/create-test-server.js");
  return module.createTestServer();
}

function specBase64(spec) {
  return Buffer.from(JSON.stringify(spec)).toString("base64");
}

async function deploy(harness, spec) {
  const response = await harness.inject({
    method: "POST",
    url: "/v1/versions",
    headers: {
      Authorization: "Bearer test_token_not_secret",
    },
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
  return harness.processDeployJobs();
}

async function withReceiver(handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    await once(request, "end");
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ request, body });
    handler(request, response, requests.length);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  return {
    url: `http://127.0.0.1:${address.port}/webhook`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function verifySignature(secret, body, signature) {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

const baseSpec = {
  openapi: "3.1.0",
  info: { title: "Payments", version: "1.0.0" },
  paths: {
    "/charges": {
      get: {
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    amount: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const breakingSpec = {
  ...baseSpec,
  paths: {
    "/charges": {
      get: {
        parameters: [{ name: "currency", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    amount: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

test("registered webhook receives a signed version.created POST after a version becomes ready", async () => {
  const receiver = await withReceiver((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const harness = await createHarness();
  const secret = "test_webhook_secret_not_real";

  try {
    harness.registerWebhook({
      organizationId: "acme",
      url: receiver.url,
      secret,
      eventTypes: ["version.created"],
    });

    const result = await deploy(harness, baseSpec);
    assert.equal(receiver.requests.length, 0, "deploy worker must enqueue delivery without posting inline");

    await harness.processWebhookJobs();

    assert.equal(receiver.requests.length, 1);
    const received = receiver.requests[0];
    assert.equal(received.request.method, "POST");
    assert.equal(received.request.headers["bumd-event-type"], "version.created");
    assert.equal(verifySignature(secret, received.body, received.request.headers["x-bumd-signature"]), true);
    const payload = JSON.parse(received.body);
    assert.equal(payload.version.id, result.version.id);
    assert.equal(payload.type, "version.created");
    const deliveries = harness.webhookDeliveries();
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].success, true);
    assert.equal(deliveries[0].statusCode, 204);
  } finally {
    await harness.close();
    await receiver.close();
  }
});

test("queued webhook jobs do not persist raw webhook secrets", async () => {
  const receiver = await withReceiver((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const harness = await createHarness();
  const secret = "test_webhook_secret_not_real";

  try {
    harness.registerWebhook({
      organizationId: "acme",
      url: receiver.url,
      secret,
      eventTypes: ["version.created"],
    });

    await deploy(harness, baseSpec);

    assert.equal(JSON.stringify(harness.webhookQueuedJobs()).includes(secret), false);
  } finally {
    await harness.close();
    await receiver.close();
  }
});

test("webhook enqueue failures do not fail a ready version", async () => {
  const receiver = await withReceiver((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const harness = await createHarness();

  try {
    harness.registerWebhook({
      organizationId: "acme",
      url: receiver.url,
      secret: "test_webhook_secret_not_real",
      eventTypes: ["version.created"],
    });
    harness.failNextWebhookEnqueue();

    const result = await deploy(harness, baseSpec);

    assert.equal(result.version.status, "ready");
    assert.equal(receiver.requests.length, 0);
  } finally {
    await harness.close();
    await receiver.close();
  }
});

test("breaking diff webhook is emitted only when stored diff has breaking changes", async () => {
  const receiver = await withReceiver((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const harness = await createHarness();

  try {
    harness.registerWebhook({
      organizationId: "acme",
      url: receiver.url,
      secret: "test_webhook_secret_not_real",
      eventTypes: ["diff.breaking_detected"],
    });

    await deploy(harness, baseSpec);
    await harness.processWebhookJobs();
    assert.equal(receiver.requests.length, 0);

    await deploy(harness, breakingSpec);
    await harness.processWebhookJobs();

    assert.equal(receiver.requests.length, 1);
    const payload = JSON.parse(receiver.requests[0].body);
    assert.equal(payload.type, "diff.breaking_detected");
    assert.equal(payload.data.diff.hasBreaking, true);
  } finally {
    await harness.close();
    await receiver.close();
  }
});

test("failed webhook delivery is retried and records every attempt", async () => {
  const receiver = await withReceiver((_request, response, count) => {
    response.writeHead(count === 1 ? 500 : 204);
    response.end();
  });
  const harness = await createHarness();
  const secret = "test_webhook_secret_not_real";

  try {
    harness.registerWebhook({
      organizationId: "acme",
      url: receiver.url,
      secret,
      eventTypes: ["version.created"],
    });

    await deploy(harness, baseSpec);
    await harness.processWebhookJobs();
    assert.equal(receiver.requests.length, 2);

    const deliveries = harness.webhookDeliveries();
    assert.equal(deliveries.length, 2);
    assert.equal(deliveries[0].success, false);
    assert.equal(deliveries[0].statusCode, 500);
    assert.equal(deliveries[0].nextDelayMs, 30_000);
    assert.equal(deliveries[1].success, true);
    assert.equal(deliveries[1].statusCode, 204);
    assert.equal(verifySignature(secret, receiver.requests[1].body, receiver.requests[1].request.headers["x-bumd-signature"]), true);
  } finally {
    await harness.close();
    await receiver.close();
  }
});

test("failed versions enqueue version.failed without dispatching inline", async () => {
  const receiver = await withReceiver((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const harness = await createHarness();

  try {
    harness.registerWebhook({
      organizationId: "acme",
      url: receiver.url,
      secret: "test_webhook_secret_not_real",
      eventTypes: ["version.failed"],
    });

    const response = await harness.inject({
      method: "POST",
      url: "/v1/versions",
      headers: { Authorization: "Bearer test_token_not_secret" },
      payload: {
        orgSlug: "acme",
        docSlug: "payments",
        branchSlug: "main",
        filename: "openapi.json",
        sourceFormat: "openapi",
        specBase64: specBase64({ paths: {} }),
      },
    });
    assert.equal(response.statusCode, 202);
    await assert.rejects(() => harness.processDeployJobs(), /deploy_processing_failed/u);
    assert.equal(receiver.requests.length, 0);

    await harness.processWebhookJobs();

    assert.equal(receiver.requests.length, 1);
    const payload = JSON.parse(receiver.requests[0].body);
    assert.equal(payload.type, "version.failed");
    assert.equal(payload.version.status, "failed");
  } finally {
    await harness.close();
    await receiver.close();
  }
});
