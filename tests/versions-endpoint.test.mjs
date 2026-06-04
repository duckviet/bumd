import assert from "node:assert/strict";
import test from "node:test";

async function createHarness() {
  const module = await import("../apps/backend/dist/testing/create-test-server.js");
  return module.createTestServer();
}

test("POST /v1/versions returns 202 and queues parse validate diff webhook work", async () => {
  const harness = await createHarness();

  try {
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
        specBase64: Buffer.from(JSON.stringify({ openapi: "3.1.0", paths: {} })).toString("base64"),
      },
    });

    assert.equal(response.statusCode, 202);
    const body = JSON.parse(response.payload);
    assert.equal(body.skipped, false);
    assert.equal(body.version.status, "queued");
    assert.equal(body.job.status, "queued");
    assert.match(body.version.sha256, /^[a-f0-9]{64}$/u);

    const workerResult = await harness.processDeployJobs();
    assert.deepEqual(workerResult.steps, ["parse", "validate", "diff", "webhook"]);
    assert.equal(workerResult.version.status, "ready");
    assert.equal(workerResult.diff.classification, "none");
    assert.equal(workerResult.webhooks[0].type, "version.created");
  } finally {
    await harness.close();
  }
});

test("POST /v1/versions returns 200 skipped for unchanged sha256 and does not duplicate jobs", async () => {
  const harness = await createHarness();

  try {
    const payload = {
      orgSlug: "acme",
      docSlug: "payments",
      branchSlug: "main",
      filename: "openapi.json",
      sourceFormat: "openapi",
      specBase64: Buffer.from(JSON.stringify({ openapi: "3.1.0", paths: {} })).toString("base64"),
    };

    const first = await harness.inject({
      method: "POST",
      url: "/v1/versions",
      headers: { Authorization: "Bearer test_token_not_secret" },
      payload,
    });
    const second = await harness.inject({
      method: "POST",
      url: "/v1/versions",
      headers: { Authorization: "Bearer test_token_not_secret" },
      payload,
    });

    assert.equal(first.statusCode, 202);
    assert.equal(second.statusCode, 200);
    const firstBody = JSON.parse(first.payload);
    const secondBody = JSON.parse(second.payload);
    assert.equal(secondBody.skipped, true);
    assert.equal(secondBody.version.id, firstBody.version.id);
    assert.equal(harness.deployJobCount(), 1);
  } finally {
    await harness.close();
  }
});

test("POST /v1/versions returns 400 for malformed deploy bodies", async () => {
  const harness = await createHarness();

  try {
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
        specBase64: "not-base64-%%%",
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.payload);
    assert.equal(body.error.code, "invalid_deploy_request");
    assert.match(body.error.requestId, /^req_/u);
  } finally {
    await harness.close();
  }
});

test("POST /v1/versions worker accepts YAML OpenAPI specs", async () => {
  const harness = await createHarness();

  try {
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
        filename: "openapi.yaml",
        sourceFormat: "openapi",
        specBase64: Buffer.from("openapi: 3.1.0\npaths: {}\n").toString("base64"),
      },
    });

    assert.equal(response.statusCode, 202);
    const workerResult = await harness.processDeployJobs();
    assert.equal(workerResult.version.status, "ready");
  } finally {
    await harness.close();
  }
});
