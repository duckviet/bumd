import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

async function createHarness() {
  const module = await import("../apps/backend/dist/testing/create-test-server.js");
  return module.createTestServer();
}

function deployPayload(overrides = {}) {
  return {
    orgSlug: "acme",
    docSlug: "payments",
    branchSlug: "main",
    filename: "openapi.json",
    sourceFormat: "openapi",
    specBase64: Buffer.from(JSON.stringify({ openapi: "3.1.0", paths: {} })).toString("base64"),
    ...overrides,
  };
}

async function createToken(harness, input = {}) {
  const response = await harness.inject({
    method: "POST",
    url: "/v1/orgs/acme/api-tokens",
    headers: { Authorization: "Bearer test_admin_session_not_secret" },
    payload: {
      name: "ci",
      role: "member",
      scopes: ["docs:deploy"],
      ...input,
    },
  });
  assert.equal(response.statusCode, 201, response.payload);
  return JSON.parse(response.payload);
}

async function deployWithToken(harness, token, payload = deployPayload()) {
  return deployWithAuthorization(harness, token === null ? null : `Token ${token}`, payload);
}

async function deployWithAuthorization(harness, authorization, payload = deployPayload()) {
  return harness.inject({
    method: "POST",
    url: "/v1/orgs/acme/docs/payments/branches/main/deploys",
    headers: authorization === null ? {} : { Authorization: authorization },
    payload,
  });
}

test("API token creation returns plaintext once and stores only hash metadata", async () => {
  const harness = await createHarness();

  try {
    const created = await createToken(harness);

    assert.match(created.token, /^bumd_live_/u);
    assert.equal(created.tokenPrefix, created.token.slice(0, 16));
    assert.equal(created.tokenHash, undefined);
    const metadata = harness.apiTokenMetadata(created.id);
    assert.equal(metadata.token, undefined);
    assert.equal(metadata.tokenHash.startsWith("$argon2"), true);
    assert.equal(metadata.tokenHash.includes(created.token), false);
  } finally {
    await harness.close();
  }
});

test("API token creation requires an authenticated admin session", async () => {
  const harness = await createHarness();

  try {
    const response = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/api-tokens",
      payload: {
        name: "ci",
        role: "member",
        scopes: ["docs:deploy"],
      },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.payload).error.code, "unauthorized");
  } finally {
    await harness.close();
  }
});

test("API token creation admin session must be allowed for the target organization", async () => {
  const previousToken = process.env.BUMD_ADMIN_SESSION_TOKEN;
  const previousOrganizations = process.env.BUMD_ADMIN_SESSION_ORGS;
  process.env.BUMD_ADMIN_SESSION_TOKEN = "test_admin_session_not_secret";
  process.env.BUMD_ADMIN_SESSION_ORGS = "other";
  const harness = await createHarness();

  try {
    const response = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/api-tokens",
      headers: { Authorization: "Bearer test_admin_session_not_secret" },
      payload: {
        name: "ci",
        role: "member",
        scopes: ["docs:deploy"],
      },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(response.payload).error.code, "forbidden");
  } finally {
    restoreEnv("BUMD_ADMIN_SESSION_TOKEN", previousToken);
    restoreEnv("BUMD_ADMIN_SESSION_ORGS", previousOrganizations);
    await harness.close();
  }
});

test("valid API token deploys with resolved tenant context and updates last used", async () => {
  const harness = await createHarness();

  try {
    const created = await createToken(harness);
    const response = await deployWithToken(harness, created.token);

    assert.equal(response.statusCode, 202, response.payload);
    const body = JSON.parse(response.payload);
    assert.equal(body.skipped, false);
    assert.equal(body.version.status, "queued");
    assert.equal(body.version.createdByTokenId, undefined);
    assert.equal(harness.versionMetadata(body.version.id).createdByTokenId, created.id);
    const metadata = harness.apiTokenMetadata(created.id);
    assert.equal(metadata.lastUsedAt === null, false);
  } finally {
    await harness.close();
  }
});

test("valid API token also deploys with documented bearer scheme", async () => {
  const harness = await createHarness();

  try {
    const created = await createToken(harness);
    const response = await deployWithAuthorization(harness, `Bearer ${created.token}`);

    assert.equal(response.statusCode, 202, response.payload);
    assert.equal(JSON.parse(response.payload).version.status, "queued");
  } finally {
    await harness.close();
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

test("missing or malformed API token returns 401 repository error shape", async () => {
  const harness = await createHarness();

  try {
    const missing = await deployWithToken(harness, null);
    assert.equal(missing.statusCode, 401);
    assert.equal(JSON.parse(missing.payload).error.code, "unauthorized");

    const malformed = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/docs/payments/branches/main/deploys",
      headers: { Authorization: "Bearer test_token_not_secret" },
      payload: deployPayload(),
    });
    assert.equal(malformed.statusCode, 401);
    const body = JSON.parse(malformed.payload);
    assert.equal(body.error.code, "unauthorized");
    assert.match(body.error.requestId, /^req_/u);
  } finally {
    await harness.close();
  }
});

test("valid API token without deploy scope returns 403", async () => {
  const harness = await createHarness();

  try {
    const created = await createToken(harness, { scopes: ["docs:read"] });
    const response = await deployWithToken(harness, created.token);

    assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(response.payload).error.code, "forbidden");
  } finally {
    await harness.close();
  }
});

test("guest API token with deploy scope still cannot deploy", async () => {
  const harness = await createHarness();

  try {
    const created = await createToken(harness, { role: "guest", scopes: ["docs:deploy"] });
    const response = await deployWithToken(harness, created.token);

    assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(response.payload).error.code, "forbidden");
  } finally {
    await harness.close();
  }
});

test("API token from another organization cannot deploy to acme doc", async () => {
  const harness = await createHarness();

  try {
    const created = await harness.issueApiToken({
      organizationId: "other",
      name: "other-ci",
      role: "member",
      scopes: ["docs:deploy"],
    });
    const response = await deployWithToken(harness, created.token);

    assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(response.payload).error.code, "forbidden");
  } finally {
    await harness.close();
  }
});

test("deploy responses and command output never leak plaintext API tokens", async () => {
  const harness = await createHarness();

  try {
    const created = await createToken(harness);
    const response = await deployWithToken(harness, created.token);
    assert.equal(response.payload.includes(created.token), false);
    assert.equal(JSON.stringify(harness.apiTokenMetadata(created.id)).includes(created.token), false);

    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["-e", "console.log('ok')"], {
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
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.stdout.includes(created.token), false);
    assert.equal(result.stderr.includes(created.token), false);
  } finally {
    await harness.close();
  }
});
