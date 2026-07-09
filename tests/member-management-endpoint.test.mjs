import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;

import { createTestServer, createApiToken } from "./test-helper.mjs";

async function insertMember(pool, suffix, role = "member") {
  const userId = `usr_member_mgmt_${suffix}`;
  const membershipId = `mem_member_mgmt_${suffix}`;
  await pool.query('DELETE FROM "Membership" WHERE id = $1', [membershipId]);
  await pool.query('DELETE FROM "User" WHERE id = $1', [userId]);
  await pool.query(
    `INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'test_hash_not_secret', NOW(), NOW())`,
    [userId, `${suffix}@example.com`, `Member ${suffix}`],
  );
  await pool.query(
    `INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt")
     VALUES ($1, 'org_acme', $2, $3, NOW(), NOW())`,
    [membershipId, userId, role],
  );
  return { userId, membershipId };
}

async function cleanupMember(pool, fixture) {
  await pool.query('DELETE FROM "Membership" WHERE id = $1', [fixture.membershipId]);
  await pool.query('DELETE FROM "User" WHERE id = $1', [fixture.userId]);
}

test("member management endpoints list, update, and remove organization members", async () => {
  const harness = await createTestServer();
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });
  const suffix = `${process.pid}_ok`;
  const fixture = await insertMember(pool, suffix);

  try {
    const token = await createApiToken(harness, "admin");

    const list = await harness.inject({
      method: "GET",
      url: "/v1/orgs/acme/members",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(list.statusCode, 200, list.payload);
    const members = JSON.parse(list.payload).members;
    assert.ok(members.some((member) => member.id === fixture.membershipId && member.email === `${suffix}@example.com`));

    const update = await harness.inject({
      method: "PATCH",
      url: `/v1/orgs/acme/members/${fixture.membershipId}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { role: "guest" },
    });
    assert.equal(update.statusCode, 200, update.payload);
    assert.equal(JSON.parse(update.payload).role, "guest");

    const remove = await harness.inject({
      method: "DELETE",
      url: `/v1/orgs/acme/members/${fixture.membershipId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(remove.statusCode, 204, remove.payload);

    const deleted = await pool.query('SELECT COUNT(*)::int AS count FROM "Membership" WHERE id = $1', [fixture.membershipId]);
    assert.equal(deleted.rows[0].count, 0);
  } finally {
    await cleanupMember(pool, fixture);
    await pool.end();
    await harness.close();
  }
});

test("member management rejects non-admin API tokens", async () => {
  const harness = await createTestServer();
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });
  const fixture = await insertMember(pool, `${process.pid}_forbidden`);

  try {
    const token = await createApiToken(harness, "member");
    const response = await harness.inject({
      method: "PATCH",
      url: `/v1/orgs/acme/members/${fixture.membershipId}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { role: "guest" },
    });

    assert.equal(response.statusCode, 403, response.payload);
    assert.equal(JSON.parse(response.payload).error.code, "forbidden");
  } finally {
    await cleanupMember(pool, fixture);
    await pool.end();
    await harness.close();
  }
});
