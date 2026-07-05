import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { DatabaseDeployStore } from "../apps/backend/dist/versions/database-deploy-store.js";
import { VersionsWorker } from "../apps/backend/dist/versions/versions-worker.js";
import { DEPLOY_STORE } from "../apps/backend/dist/versions/deploy-ports.js";
import { DatabaseWebhookStore } from "../apps/backend/dist/webhooks/database-webhook-store.js";
import { createTestServer, createApiToken } from "./test-helper.mjs";

const { Pool } = pg;

test("DatabaseDeployStore createQueuedVersion is transactional and rolls back on failure", async () => {
  const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";
  const pool = new Pool({ connectionString: databaseUrl });

  // Create mock ObjectStore that throws error on put
  const failingObjectStore = {
    put: async () => { throw new Error("storage_failure"); },
    get: async () => "spec",
  };

  const store = new DatabaseDeployStore(databaseUrl, failingObjectStore);

  // Setup DB: clean up first
  await pool.query('DELETE FROM "Version" WHERE id = \'ver_tx_fail\'');
  await pool.query('DELETE FROM "Branch" WHERE slug = \'tx_fail\'');

  try {
    await store.createQueuedVersion({
      orgSlug: "acme",
      docSlug: "payments",
      branchSlug: "tx_fail",
      sha256: "tx_fail_sha256",
      sourceFormat: "openapi",
      rawSpec: "spec",
      createdByTokenId: "",
    });
    assert.fail("Should have thrown error");
  } catch (error) {
    assert.equal(error.message, "storage_failure");
  }

  // Verify database rolled back
  const branch = await pool.query('SELECT * FROM "Branch" WHERE slug = \'tx_fail\'');
  assert.equal(branch.rows.length, 0);

  await pool.end();
});

test("DatabaseDeployStore markVersionFailed records error details in ProcessingJob table", async () => {
  const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";
  const pool = new Pool({ connectionString: databaseUrl });
  const objectStore = { put: async () => {}, get: async () => "spec" };
  const store = new DatabaseDeployStore(databaseUrl, objectStore);

  // Setup: create a queued version
  const { version } = await store.createQueuedVersion({
    orgSlug: "acme",
    docSlug: "payments",
    branchSlug: "main",
    sha256: "test_failed_err_sha",
    sourceFormat: "openapi",
    rawSpec: "spec",
    createdByTokenId: "",
  });

  const testError = new Error("Failed validation due to syntax error");
  await store.markVersionFailed(version.id, testError);

  // Query database for processing job error
  const res = await pool.query('SELECT error FROM "ProcessingJob" WHERE "versionId" = $1', [version.id]);
  assert.equal(res.rows.length, 1);
  const dbError = res.rows[0].error;
  assert.equal(dbError.message, "Failed validation due to syntax error");
  assert.ok(dbError.stack);

  // Cleanup
  await pool.query('DELETE FROM "ProcessingJob" WHERE "versionId" = $1', [version.id]);
  await pool.query('DELETE FROM "Version" WHERE id = $1', [version.id]);
  await pool.end();
});

test("VersionsWorker tolerates duplicate execution of already ready versions", async () => {
  const harness = await createTestServer();
  try {
    const token = await createApiToken(harness, "member");
    
    // Deploy first version
    const payload = {
      orgSlug: "acme",
      docSlug: "payments",
      branchSlug: "main",
      filename: "openapi.json",
      sourceFormat: "openapi",
      specBase64: Buffer.from(JSON.stringify({ openapi: "3.1.0", paths: {} })).toString("base64"),
    };

    const res = await harness.inject({
      method: "POST",
      url: "/v1/versions",
      headers: { Authorization: `Token ${token}` },
      payload,
    });
    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.payload);
    
    // Run worker first time
    const result1 = await harness.processDeployJobs();
    assert.deepEqual(result1.steps, ["parse", "validate", "diff", "search", "webhook"]);
    assert.equal(result1.version.status, "ready");

    // Manually run worker on same job again
    const worker = harness.app.get(VersionsWorker);
    const result2 = await worker.process({ versionId: body.version.id });
    assert.deepEqual(result2.steps, ["parse", "validate", "diff", "search", "webhook"]);
    assert.equal(result2.version.status, "ready");
  } finally {
    await harness.close();
  }
});

test("object storage keys are redacted from customer-facing deploy errors", async () => {
  const harness = await createTestServer();
  try {
    const token = await createApiToken(harness, "member");
    
    // Stub createQueuedVersion to throw an error with the key
    const store = harness.app.get(DEPLOY_STORE);
    store.createQueuedVersion = async () => {
      throw new Error("Failed to write to S3 bucket at path specs/sensitive_key_hash");
    };

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
        specBase64: Buffer.from(JSON.stringify({ openapi: "3.1.0", paths: {} })).toString("base64"),
      },
    });

    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(response.payload, /specs\/sensitive_key_hash/u);
  } finally {
    await harness.close();
  }
});

test("SearchController enforces public/private doc visibility and tenant isolation in database mode", async () => {
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });

  const orgId = "org_search_test";
  const docPublicId = "doc_public_search";
  const docPrivateId = "doc_private_search";
  
  await pool.query('DELETE FROM "Doc" WHERE id IN ($1, $2)', [docPublicId, docPrivateId]);
  await pool.query('DELETE FROM "Organization" WHERE id = $1', [orgId]);
  
  await pool.query('INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())', [orgId, "search-test-org", "Search Test Org"]);
  
  // Public doc
  await pool.query(
    'INSERT INTO "Doc" (id, "organizationId", slug, name, visibility, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, \'public\', NOW(), NOW())',
    [docPublicId, orgId, "public-doc", "Public Doc"],
  );
  // Private doc
  await pool.query(
    'INSERT INTO "Doc" (id, "organizationId", slug, name, visibility, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, \'private\', NOW(), NOW())',
    [docPrivateId, orgId, "private-doc", "Private Doc"],
  );

  const harness = await createTestServer();
  try {
    process.env["DEPLOY_STORE"] = "database";

    // 1. Search public doc without token -> should proceed and call SearchIndex.search
    const pubRes = await harness.inject({
      method: "GET",
      url: "/v1/orgs/search-test-org/docs/public-doc/search?q=test",
    });
    assert.equal(pubRes.statusCode, 200);

    // 2. Search private doc without token -> should fail with 401
    const privRes = await harness.inject({
      method: "GET",
      url: "/v1/orgs/search-test-org/docs/private-doc/search?q=test",
    });
    assert.equal(privRes.statusCode, 401);
  } finally {
    process.env["DEPLOY_STORE"] = "memory";
    await pool.query('DELETE FROM "Doc" WHERE id IN ($1, $2)', [docPublicId, docPrivateId]);
    await pool.query('DELETE FROM "Organization" WHERE id = $1', [orgId]);
    await pool.end();
    await harness.close();
  }
});

test("DatabaseWebhookStore records persistent delivery attempts and terminally fails (dead-letter)", async () => {
  const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";
  const pool = new Pool({ connectionString: databaseUrl });
  
  const webhookId = `wh_del_test_${Date.now().toString().slice(-4)}`;
  const orgId = "org_wh_test";

  // Clean up first
  await pool.query('DELETE FROM "WebhookDelivery" WHERE "organizationId" = $1', [orgId]);
  await pool.query('DELETE FROM "Webhook" WHERE "organizationId" = $1', [orgId]);
  await pool.query('DELETE FROM "Organization" WHERE id = $1', [orgId]);

  // Insert organization
  await pool.query(
    'INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())',
    [orgId, "wh-test-org", "Webhook Test Org"]
  );
  
  await pool.query(
    'INSERT INTO "Webhook" (id, "organizationId", url, "secretRef", enabled, "eventTypes", "createdAt", "updatedAt") VALUES ($1, $2, \'https://example.com/hooks\', \'enc:secret\', true, ARRAY[\'version.created\'], NOW(), NOW())',
    [webhookId, orgId],
  );

  const store = new DatabaseWebhookStore(databaseUrl);

  // 1. Record retrying attempt (nextDelayMs = 1000)
  const attempt1 = await store.recordDeliveryAttempt({
    organizationId: orgId,
    webhookId,
    eventId: "evt_1",
    eventType: "version.created",
    payload: { id: "evt_1" },
    attemptNumber: 1,
    status: "retrying",
    statusCode: 500,
    success: false,
    error: "Internal Server Error",
    nextDelayMs: 1000,
  });

  const res1 = await pool.query('SELECT status, "nextAttemptAt" FROM "WebhookDelivery" WHERE id = $1', [attempt1.id]);
  assert.equal(res1.rows.length, 1);
  assert.equal(res1.rows[0].status, "retrying");
  assert.ok(res1.rows[0].nextAttemptAt instanceof Date);

  // 2. Record terminal attempt (nextDelayMs = null, success = false)
  const attempt2 = await store.recordDeliveryAttempt({
    organizationId: orgId,
    webhookId,
    eventId: "evt_1",
    eventType: "version.created",
    payload: { id: "evt_1" },
    attemptNumber: 5,
    status: "failed",
    statusCode: 503,
    success: false,
    error: "Service Unavailable",
    nextDelayMs: null,
  });

  const res2 = await pool.query('SELECT status, "nextAttemptAt" FROM "WebhookDelivery" WHERE id = $1', [attempt2.id]);
  assert.equal(res2.rows.length, 1);
  assert.equal(res2.rows[0].status, "failed");
  assert.equal(res2.rows[0].nextAttemptAt, null);

  // Clean up
  await pool.query('DELETE FROM "WebhookDelivery" WHERE "webhookId" = $1', [webhookId]);
  await pool.query('DELETE FROM "Webhook" WHERE id = $1', [webhookId]);
  await pool.query('DELETE FROM "Organization" WHERE id = $1', [orgId]);
  await pool.end();
});
