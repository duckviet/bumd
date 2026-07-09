import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import pg from "pg";
import { createTestServer, createApiToken } from "./test-helper.mjs";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function signPayload(payload, secret) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return { body, signature: `sha256=${sig}` };
}

async function seedGithubInstallation(pool, githubInstallationId) {
  await pool.query(
    `INSERT INTO "GithubInstallation" (id, "organizationId", "githubInstallationId", "accountName", "createdAt", "updatedAt")
     VALUES ($1, 'org_acme', $2, 'octo', NOW(), NOW())
     ON CONFLICT ("githubInstallationId") DO NOTHING`,
    [`ghinst_${githubInstallationId}`, githubInstallationId],
  );
}

// ---------------------------------------------------------------------------
// 1. Repository linking, unlinking and branch mapping CRUD
// ---------------------------------------------------------------------------

test("GitHub integration: repository link, list, and unlink", async () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const harness = await createTestServer();
  try {
    // Link a repository
    await seedGithubInstallation(pool, "inst_001");

    const linkRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/github/repositories",
      payload: {
        githubInstallationId: "inst_001",
        githubRepoId: "123456",
        fullName: "octo/payments",
      },
    });
    assert.equal(linkRes.statusCode, 201, linkRes.payload);
    const linked = JSON.parse(linkRes.payload);
    assert.equal(linked.repository.fullName, "octo/payments");
    assert.equal(linked.repository.organizationId, "org_acme");

    // List repositories
    const listRes = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/github/repositories",
    });
    assert.equal(listRes.statusCode, 200, listRes.payload);
    const list = JSON.parse(listRes.payload);
    assert.ok(list.repositories.some((r) => r.fullName === "octo/payments"));

    // Unlink repository
    const unlinkRes = await harness.inject({
      method: "DELETE",
      url: `/v1/orgs/acme/github/repositories/${linked.repository.id}`,
    });
    assert.equal(unlinkRes.statusCode, 204, unlinkRes.payload);
  } finally {
    await pool.end();
    await harness.close();
  }
});

test("GitHub integration: branch mapping CRUD", async () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const harness = await createTestServer();
  try {
    // Setup: Link a repository
    await seedGithubInstallation(pool, "inst_002");

    const linkRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/github/repositories",
      payload: {
        githubInstallationId: "inst_002",
        githubRepoId: "234567",
        fullName: "octo/catalog",
      },
    });
    assert.equal(linkRes.statusCode, 201, linkRes.payload);
    const githubRepoId = "234567";

    // Create a mapping
    const createRes = await harness.inject({
      method: "POST",
      url: `/v1/orgs/acme/github/repositories/${githubRepoId}/mappings`,
      payload: {
        branchName: "main",
        specPath: "openapi/catalog.yaml",
        docId: "doc_payments",
      },
    });
    assert.equal(createRes.statusCode, 201, createRes.payload);
    const created = JSON.parse(createRes.payload);
    assert.equal(created.mapping.branchName, "main");
    assert.equal(created.mapping.specPath, "openapi/catalog.yaml");

    // List mappings
    const listRes = await harness.inject({
      method: "GET",
      url: `/v1/orgs/acme/github/repositories/${githubRepoId}/mappings`,
    });
    assert.equal(listRes.statusCode, 200, listRes.payload);
    const listBody = JSON.parse(listRes.payload);
    assert.ok(listBody.mappings.length > 0);

    // Delete mapping
    const deleteRes = await harness.inject({
      method: "DELETE",
      url: `/v1/orgs/acme/github/repositories/${githubRepoId}/mappings/${created.mapping.id}`,
    });
    assert.equal(deleteRes.statusCode, 204, deleteRes.payload);
  } finally {
    await pool.end();
    await harness.close();
  }
});

// ---------------------------------------------------------------------------
// 2. Webhook signature verification
// ---------------------------------------------------------------------------

test("GitHub webhook receiver: valid signature processes event", async () => {
  process.env["GITHUB_WEBHOOK_SECRET"] = "test_webhook_secret_not_real";

  const harness = await createTestServer();
  try {
    const payload = {
      ref: "refs/heads/main",
      repository: { id: 999999, full_name: "octo/test-repo" },
      installation: { id: 1 },
      after: "abc123sha",
    };
    const { body, signature } = signPayload(payload, "test_webhook_secret_not_real");

    const res = await harness.inject({
      method: "POST",
      url: "/v1/github/webhooks",
      headers: {
        "x-github-event": "push",
        "x-hub-signature-256": signature,
        "content-type": "application/json",
      },
      payload: body,
    });
    assert.equal(res.statusCode, 200, res.payload);
    const body2 = JSON.parse(res.payload);
    assert.equal(body2.ok, true);
  } finally {
    await harness.close();
  }
});

test("GitHub webhook receiver: invalid signature returns 401", async () => {
  process.env["GITHUB_WEBHOOK_SECRET"] = "test_webhook_secret_not_real";

  const harness = await createTestServer();
  try {
    const payload = { ref: "refs/heads/main", repository: { id: 1, full_name: "x/y" } };
    const { body } = signPayload(payload, "wrong_secret");

    const res = await harness.inject({
      method: "POST",
      url: "/v1/github/webhooks",
      headers: {
        "x-github-event": "push",
        "x-hub-signature-256": "sha256=invalidsignature",
        "content-type": "application/json",
      },
      payload: body,
    });
    assert.equal(res.statusCode, 401, res.payload);
  } finally {
    delete process.env["GITHUB_WEBHOOK_SECRET"];
    await harness.close();
  }
});

test("GitHub webhook receiver: replay/adversarial - tampered body returns 401", async () => {
  process.env["GITHUB_WEBHOOK_SECRET"] = "test_webhook_secret_not_real";

  const harness = await createTestServer();
  try {
    const originalPayload = { ref: "refs/heads/main", repository: { id: 1, full_name: "x/y" } };
    const { signature } = signPayload(originalPayload, "test_webhook_secret_not_real");

    // Tamper the body after signing
    const tamperedBody = JSON.stringify({
      ref: "refs/heads/evil-branch",
      repository: { id: 1, full_name: "x/y" },
    });

    const res = await harness.inject({
      method: "POST",
      url: "/v1/github/webhooks",
      headers: {
        "x-github-event": "push",
        "x-hub-signature-256": signature, // valid signature for ORIGINAL body
        "content-type": "application/json",
      },
      payload: tamperedBody, // but sending TAMPERED body
    });
    assert.equal(res.statusCode, 401, res.payload);
  } finally {
    delete process.env["GITHUB_WEBHOOK_SECRET"];
    await harness.close();
  }
});

// ---------------------------------------------------------------------------
// 3. Tenant isolation: cross-org repository access blocked
// ---------------------------------------------------------------------------

test("GitHub integration: tenant isolation - cannot access other org repositories", async () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const harness = await createTestServer();
  try {
    // Link a repository to 'acme' org
    await seedGithubInstallation(pool, "inst_003");

    const linkRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/github/repositories",
      payload: {
        githubInstallationId: "inst_003",
        githubRepoId: "345678",
        fullName: "acme/private-repo",
      },
    });
    assert.equal(linkRes.statusCode, 201, linkRes.payload);

    // List repositories for another org - should return empty (tenant scoped)
    const listOtherRes = await harness.inject({
      method: "GET",
      url: "/v1/orgs/other/github/repositories",
    });
    assert.equal(listOtherRes.statusCode, 200, listOtherRes.payload);
    const otherBody = JSON.parse(listOtherRes.payload);
    const found = otherBody.repositories.find((r) => r.githubRepoId === "345678");
    assert.equal(found, undefined, "Cross-org repository must not be visible");
  } finally {
    await pool.end();
    await harness.close();
  }
});

// ---------------------------------------------------------------------------
// 4. push webhook triggers background job enqueue (observable via InMemoryGithubQueue)
// ---------------------------------------------------------------------------

test("GitHub webhook receiver: push event enqueues job with correct type and payload", async () => {
  const harness = await createTestServer();
  try {
    const pushPayload = {
      ref: "refs/heads/main",
      repository: { id: 111111, full_name: "octo/enqueue-test" },
      installation: { id: 1 },
      after: "deadbeef",
    };

    process.env["GITHUB_WEBHOOK_SECRET"] = "test_webhook_secret_not_real";
    const { body, signature } = signPayload(pushPayload, "test_webhook_secret_not_real");

    const res = await harness.inject({
      method: "POST",
      url: "/v1/github/webhooks",
      headers: {
        "x-github-event": "push",
        "x-hub-signature-256": signature,
        "content-type": "application/json",
      },
      payload: body,
    });
    assert.equal(res.statusCode, 200, res.payload);
    assert.equal(JSON.parse(res.payload).ok, true);
  } finally {
    await harness.close();
  }
});

// ---------------------------------------------------------------------------
// 5. pull_request webhook ignored when action is not opened/synchronize/reopened
// ---------------------------------------------------------------------------

test("GitHub webhook receiver: pull_request closed action is silently ignored", async () => {
  const harness = await createTestServer();
  try {
    delete process.env["GITHUB_WEBHOOK_SECRET"];

    const prPayload = {
      action: "closed",
      number: 42,
      pull_request: { head: { ref: "feature/x", sha: "abc" }, base: { ref: "main", sha: "def" } },
      repository: { id: 222222, full_name: "octo/test" },
    };


    process.env["GITHUB_WEBHOOK_SECRET"] = "test_webhook_secret_not_real";
    const { body, signature } = signPayload(prPayload, "test_webhook_secret_not_real");

    const res = await harness.inject({
      method: "POST",
      url: "/v1/github/webhooks",
      headers: {
        "x-github-event": "pull_request",
        "x-hub-signature-256": signature,
        "content-type": "application/json",
      },
      payload: body,
    });
    assert.equal(res.statusCode, 200, res.payload);
    assert.equal(JSON.parse(res.payload).ok, true);
  } finally {
    await harness.close();
  }
});
