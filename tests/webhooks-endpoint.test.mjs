import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { decryptSecret } from "../apps/backend/dist/webhooks/webhook-encryption.js";

const { Pool } = pg;

import { createTestServer, createApiToken } from "./test-helper.mjs";

test("webhooks API endpoints CRUD, secret rotation, and encryption at rest", async () => {
  const harness = await createTestServer();
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });

  try {
    const adminToken = await createApiToken(harness, "admin");
    const memberToken = await createApiToken(harness, "member");
    const otherAdminToken = await createApiToken(harness, "admin", "other");

    // 1. Create Webhook
    const createRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/webhooks",
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        url: "https://example.com/hooks/acme",
        description: "Test webhook endpoint",
        eventTypes: ["version.created", "diff.breaking_detected"],
      },
    });
    assert.equal(createRes.statusCode, 201, createRes.payload);
    const created = JSON.parse(createRes.payload);
    assert.ok(created.id);
    assert.ok(created.secret);
    assert.equal(created.url, "https://example.com/hooks/acme");
    assert.equal(created.description, "Test webhook endpoint");
    assert.deepEqual(created.eventTypes, ["version.created", "diff.breaking_detected"]);
    assert.equal(created.enabled, true);

    // Verify secret is stored encrypted in PostgreSQL
    const dbRows = await pool.query('SELECT "secretRef" FROM "Webhook" WHERE id = $1', [created.id]);
    assert.equal(dbRows.rows.length, 1);
    const dbSecretRef = dbRows.rows[0].secretRef;
    assert.ok(dbSecretRef.startsWith("enc:"));
    assert.notEqual(dbSecretRef, created.secret);
    // Verify it decrypts back to the exact plaintext secret
    assert.equal(decryptSecret(dbSecretRef), created.secret);

    // 2. List Webhooks
    const listRes = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/webhooks",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listRes.statusCode, 200, listRes.payload);
    const list = JSON.parse(listRes.payload);
    assert.ok(list.some((wh) => wh.id === created.id));
    // Verify list does not leak secret
    assert.doesNotMatch(listRes.payload, new RegExp(created.secret, "u"));

    // 3. Update Webhook (PATCH)
    const patchRes = await harness.inject({
      method: "PATCH",
      url: `/v1/orgs/acme/webhooks/${created.id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        url: "https://example.com/hooks/acme-updated",
        enabled: false,
        eventTypes: ["version.failed"],
      },
    });
    assert.equal(patchRes.statusCode, 200, patchRes.payload);
    const patched = JSON.parse(patchRes.payload);
    assert.equal(patched.url, "https://example.com/hooks/acme-updated");
    assert.equal(patched.enabled, false);
    assert.deepEqual(patched.eventTypes, ["version.failed"]);

    // 4. Rotate Secret
    const rotateRes = await harness.inject({
      method: "POST",
      url: `/v1/orgs/acme/webhooks/${created.id}/rotate-secret`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(rotateRes.statusCode, 200, rotateRes.payload);
    const rotated = JSON.parse(rotateRes.payload);
    assert.ok(rotated.secret);
    assert.notEqual(rotated.secret, created.secret);

    // Verify rotated secret is stored encrypted in database
    const dbRowsRotated = await pool.query('SELECT "secretRef" FROM "Webhook" WHERE id = $1', [created.id]);
    const rotatedSecretRef = dbRowsRotated.rows[0].secretRef;
    assert.ok(rotatedSecretRef.startsWith("enc:"));
    assert.equal(decryptSecret(rotatedSecretRef), rotated.secret);

    // 5. Cross-tenant access check
    const crossPatch = await harness.inject({
      method: "PATCH",
      url: `/v1/orgs/acme/webhooks/${created.id}`,
      headers: { Authorization: `Bearer ${otherAdminToken}` },
      payload: { url: "https://malicious.com" },
    });
    assert.equal(crossPatch.statusCode, 403);

    // 6. Delete Webhook
    const deleteRes = await harness.inject({
      method: "DELETE",
      url: `/v1/orgs/acme/webhooks/${created.id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deleteRes.statusCode, 204);

    // Verifying it is gone
    const afterDeleteRows = await pool.query('SELECT id FROM "Webhook" WHERE id = $1', [created.id]);
    assert.equal(afterDeleteRows.rows.length, 0);
  } finally {
    await pool.end();
    await harness.close();
  }
});

test("webhooks list deliveries endpoint and role constraints", async () => {
  const harness = await createTestServer();
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });

  try {
    const adminToken = await createApiToken(harness, "admin");
    const memberToken = await createApiToken(harness, "member");

    // Create webhook
    const createRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/webhooks",
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        url: "https://example.com/hooks/deliveries",
        eventTypes: ["version.created"],
      },
    });
    assert.equal(createRes.statusCode, 201, createRes.payload);
    const created = JSON.parse(createRes.payload);

    // Insert mock WebhookDelivery
    const deliveryId = "del_test_123";
    await pool.query('DELETE FROM "WebhookDelivery" WHERE id = $1', [deliveryId]);
    await pool.query(
      `INSERT INTO "WebhookDelivery" (id, "organizationId", "webhookId", "eventId", "eventType", payload, status, "attemptCount", status_code, success, "createdAt", "updatedAt")
       VALUES ($1, 'org_acme', $2, 'evt_test_123', 'version.created', '{}'::jsonb, 'delivered', 1, 200, true, NOW(), NOW())`,
      [deliveryId, created.id],
    );

    // 1. List deliveries
    const deliveriesRes = await harness.inject({
      method: "GET",
      url: `/v1/orgs/acme/webhooks/${created.id}/deliveries`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deliveriesRes.statusCode, 200, deliveriesRes.payload);
    const { deliveries } = JSON.parse(deliveriesRes.payload);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].id, deliveryId);
    assert.equal(deliveries[0].status, "delivered");
    assert.equal(deliveries[0].statusCode, 200);

    // 2. Member/Guest role check
    const memberDeliveriesRes = await harness.inject({
      method: "GET",
      url: `/v1/orgs/acme/webhooks/${created.id}/deliveries`,
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(memberDeliveriesRes.statusCode, 403);

    // Cleanup
    await pool.query('DELETE FROM "WebhookDelivery" WHERE id = $1', [deliveryId]);
    await pool.query('DELETE FROM "Webhook" WHERE id = $1', [created.id]);
  } finally {
    await pool.end();
    await harness.close();
  }
});
