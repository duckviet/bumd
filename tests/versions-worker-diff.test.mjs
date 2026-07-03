import assert from "node:assert/strict";
import test from "node:test";

async function createHarness() {
  const module = await import("../apps/backend/dist/testing/create-test-server.js");
  return module.createTestServer();
}

function specBase64(spec) {
  return Buffer.from(JSON.stringify(spec)).toString("base64");
}

async function deploy(harness, spec) {
  const token = await harness.issueApiToken({
    organizationId: "acme",
    name: `ci-${Date.now()}`,
    role: "member",
    scopes: ["docs:deploy"],
  });
  const response = await harness.inject({
    method: "POST",
    url: "/v1/versions",
    headers: {
      Authorization: `Token ${token.token}`,
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

const oldSpec = {
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

test("worker stores a breaking diff when a new version changes the previous branch version", async () => {
  const harness = await createHarness();

  try {
    await deploy(harness, oldSpec);
    const result = await deploy(harness, {
      ...oldSpec,
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
    });

    assert.equal(result.diff.classification, "breaking");
    assert.equal(result.diff.hasBreaking, true);
    assert.match(result.diff.markdown, /Breaking changes/u);
    const stored = await harness.diffForVersion(result.version.id);
    assert.equal(stored.hasBreaking, true);
    assert.match(stored.diffMarkdown, /Breaking changes/u);
  } finally {
    await harness.close();
  }
});

test("worker stores an initial diff when there is no previous branch version", async () => {
  const harness = await createHarness();

  try {
    const result = await deploy(harness, oldSpec);

    assert.equal(result.diff.classification, "none");
    assert.equal(result.diff.hasBreaking, false);
    assert.match(result.diff.markdown, /Initial version/u);
    const stored = await harness.diffForVersion(result.version.id);
    assert.equal(stored.hasBreaking, false);
    assert.match(stored.diffMarkdown, /Initial version/u);
  } finally {
    await harness.close();
  }
});
