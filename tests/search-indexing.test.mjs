import assert from "node:assert/strict";
import test from "node:test";

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

async function deploy(harness, token, spec) {
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
  return harness.processDeployJobs();
}

test("worker indexes ready OpenAPI operations by doc branch version", async () => {
  const harness = await createHarness();

  try {
    const token = await issueToken(harness);
    const first = await deploy(harness, token, {
      openapi: "3.1.0",
      info: { title: "Payments", version: "1.0.0" },
      paths: {
        "/payments": {
          post: {
            operationId: "createPayment",
            tags: ["payments"],
            summary: "Create a payment",
            description: "Creates a payment for a customer.",
            responses: { "201": { description: "created" } },
          },
        },
      },
    });

    assert.deepEqual(first.steps, ["parse", "validate", "diff", "search", "webhook"]);
    const createResponse = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/docs/payments/search?q=createPayment&branchSlug=main",
      headers: { Authorization: `Token ${token}` },
    });
    assert.equal(createResponse.statusCode, 200);
    const createBody = JSON.parse(createResponse.payload);
    assert.equal(createBody.hits.length, 1);
    assert.equal(createBody.hits[0].operationId, "createPayment");
    assert.equal(createBody.hits[0].path, "/payments");
    assert.deepEqual(createBody.hits[0].tags, ["payments"]);
    assert.equal(createBody.hits[0].summary, "Create a payment");
    assert.equal(createBody.hits[0].description, "Creates a payment for a customer.");

    await deploy(harness, token, {
      openapi: "3.1.0",
      info: { title: "Payments", version: "1.1.0" },
      paths: {
        "/refunds": {
          post: {
            operationId: "createRefund",
            tags: ["refunds"],
            summary: "Create a refund",
            description: "Creates a refund for a payment.",
            responses: { "201": { description: "created" } },
          },
        },
      },
    });

    const refundResponse = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/docs/payments/search?q=createRefund&branchSlug=main",
      headers: { Authorization: `Token ${token}` },
    });
    assert.equal(refundResponse.statusCode, 200);
    const refundBody = JSON.parse(refundResponse.payload);
    assert.equal(refundBody.hits.length, 1);
    assert.equal(refundBody.hits[0].operationId, "createRefund");

    const staleResponse = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/docs/payments/search?q=createPayment&branchSlug=main",
      headers: { Authorization: `Token ${token}` },
    });
    assert.equal(staleResponse.statusCode, 200);
    assert.equal(JSON.parse(staleResponse.payload).hits.length, 0);
  } finally {
    await harness.close();
  }
});

test("search requires an API token from the current organization", async () => {
  const harness = await createHarness();

  try {
    const token = await issueToken(harness);
    await deploy(harness, token, {
      openapi: "3.1.0",
      info: { title: "Payments", version: "1.0.0" },
      paths: {
        "/payments": {
          post: {
            operationId: "createPayment",
            responses: { "201": { description: "created" } },
          },
        },
      },
    });

    const missing = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/docs/payments/search?q=createPayment&branchSlug=main",
    });
    assert.equal(missing.statusCode, 401);

    const other = await harness.issueApiToken({
      organizationId: "other",
      name: "reader",
      role: "member",
      scopes: ["docs:read"],
    });
    const forbidden = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/docs/payments/search?q=createPayment&branchSlug=main",
      headers: { Authorization: `Token ${other.token}` },
    });
    assert.equal(forbidden.statusCode, 403);
  } finally {
    await harness.close();
  }
});
