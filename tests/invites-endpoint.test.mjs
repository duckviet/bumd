import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { createHash } from "node:crypto";

const { Pool } = pg;

import { createTestServer, createApiToken } from "./test-helper.mjs";

test("invites CRUD endpoints and token hashing lifecycle", async () => {
  const harness = await createTestServer();
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });

  try {
    const adminToken = await createApiToken(harness, "admin");
    const memberToken = await createApiToken(harness, "member");

    // 1. Create Invite
    const createRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/invites",
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        email: "invited_user@example.com",
        role: "member",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    assert.equal(createRes.statusCode, 201, createRes.payload);
    const created = JSON.parse(createRes.payload);
    assert.ok(created.id);
    assert.ok(created.token);
    assert.equal(created.email, "invited_user@example.com");
    assert.equal(created.role, "member");

    // Verify token was stored hashed, and raw token is not in DB
    const dbRows = await pool.query('SELECT * FROM "Invite" WHERE id = $1', [created.id]);
    assert.equal(dbRows.rows.length, 1);
    const dbRow = dbRows.rows[0];
    assert.equal(dbRow.tokenHash, createHash("sha256").update(created.token).digest("hex"));
    assert.doesNotMatch(JSON.stringify(dbRow), new RegExp(created.token, "u"));

    // 2. List Invites
    const listRes = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/invites",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listRes.statusCode, 200, listRes.payload);
    const { invites } = JSON.parse(listRes.payload);
    assert.ok(invites.some((inv) => inv.id === created.id));
    // Verify list doesn't leak secrets
    assert.doesNotMatch(listRes.payload, new RegExp(created.token, "u"));

    // 3. Reject non-admin role for create and list
    const memberCreateRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/invites",
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: { email: "fail@example.com", role: "member" },
    });
    assert.equal(memberCreateRes.statusCode, 403);

    const memberListRes = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/invites",
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(memberListRes.statusCode, 403);

    // 4. Accept Invite
    const testUserId = "usr_invited_123";
    await pool.query('DELETE FROM "Membership" WHERE "userId" = $1', [testUserId]);
    await pool.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
    await pool.query(
      `INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt")
       VALUES ($1, 'invited_user@example.com', 'Invited User', 'hash', NOW(), NOW())`,
      [testUserId],
    );

    const acceptRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/invites/accept",
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: {
        token: created.token,
        userId: testUserId,
      },
    });
    assert.equal(acceptRes.statusCode, 200, acceptRes.payload);

    // Verify membership is attached
    const membershipRes = await pool.query(
      'SELECT role::text FROM "Membership" WHERE "organizationId" = \'org_acme\' AND "userId" = $1',
      [testUserId],
    );
    assert.equal(membershipRes.rows.length, 1);
    assert.equal(membershipRes.rows[0].role, "member");

    // Reject reusing already accepted token
    const acceptAgainRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/invites/accept",
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: {
        token: created.token,
        userId: testUserId,
      },
    });
    assert.equal(acceptAgainRes.statusCode, 400);

    // Clean up
    await pool.query('DELETE FROM "Membership" WHERE "userId" = $1', [testUserId]);
    await pool.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
    await pool.query('DELETE FROM "Invite" WHERE id = $1', [created.id]);
  } finally {
    await pool.end();
    await harness.close();
  }
});

test("invites revoke and validation constraints", async () => {
  const harness = await createTestServer();
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });

  try {
    const adminToken = await createApiToken(harness, "admin");
    const otherAdminToken = await createApiToken(harness, "admin", "other");
    const memberToken = await createApiToken(harness, "member");

    // 1. Revoking invite
    const createRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/invites",
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { role: "guest" },
    });
    const created = JSON.parse(createRes.payload);

    // Verify cross-tenant delete/revoke is blocked
    const crossDelete = await harness.inject({
      method: "DELETE",
      url: `/v1/orgs/acme/invites/${created.id}`,
      headers: { Authorization: `Bearer ${otherAdminToken}` },
    });
    assert.equal(crossDelete.statusCode, 403);

    // Revoke successfully
    const deleteRes = await harness.inject({
      method: "DELETE",
      url: `/v1/orgs/acme/invites/${created.id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deleteRes.statusCode, 204);

    // Accepting revoked token must fail
    const acceptRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/invites/accept",
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: {
        token: created.token,
        userId: "usr_dummy",
      },
    });
    assert.equal(acceptRes.statusCode, 400);

    // 2. Expired invite token must fail
    const expiredRes = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/invites",
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        role: "member",
        expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
      },
    });
    const expired = JSON.parse(expiredRes.payload);

    const acceptExpired = await harness.inject({
      method: "POST",
      url: "/v1/orgs/acme/invites/accept",
      headers: { Authorization: `Bearer ${memberToken}` },
      payload: {
        token: expired.token,
        userId: "usr_dummy",
      },
    });
    assert.equal(acceptExpired.statusCode, 400);

    // Clean up
    await pool.query('DELETE FROM "Invite" WHERE id IN ($1, $2)', [created.id, expired.id]);
  } finally {
    await pool.end();
    await harness.close();
  }
});
