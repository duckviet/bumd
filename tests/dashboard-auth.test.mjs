import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { createTestServer } from "./test-helper.mjs";

const { Pool } = pg;

function credentials(suffix) {
  return {
    email: `dashboard-auth-${suffix}@example.com`,
    password: "correct horse battery staple",
    name: "Dashboard Auth",
  };
}

function authorization(accessCredential) {
  return { Authorization: `Bearer ${accessCredential}` };
}

test("dashboard auth registers, rotates refresh credentials, revokes sessions, and scopes memberships", async () => {
  const harness = await createTestServer();
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = `${process.pid}-${Date.now()}`;
  const input = credentials(suffix);

  try {
    const malformed = await harness.inject({
      method: "POST",
      url: "/v1/dashboard/auth/login",
      payload: { email: input.email },
    });
    assert.equal(malformed.statusCode, 400);
    assert.equal(JSON.parse(malformed.payload).error.code, "validation_failed");

    const registered = await harness.inject({
      method: "POST",
      url: "/v1/dashboard/auth/register",
      payload: input,
    });
    assert.equal(registered.statusCode, 201);
    const created = JSON.parse(registered.payload);
    assert.equal(created.user.email, input.email);
    assert.equal(typeof created.accessCredential, "string");
    assert.equal(typeof created.refreshCredential, "string");

    const me = await harness.inject({
      method: "GET",
      url: "/v1/dashboard/me",
      headers: authorization(created.accessCredential),
    });
    assert.equal(me.statusCode, 200);
    const current = JSON.parse(me.payload);
    assert.equal(current.user.email, input.email);
    assert.equal(current.memberships.length, 1);

    const crossOrganization = await harness.inject({
      method: "GET",
      url: "/v1/dashboard/orgs/acme/membership",
      headers: authorization(created.accessCredential),
    });
    assert.equal(crossOrganization.statusCode, 404);

    const rotated = await harness.inject({
      method: "POST",
      url: "/v1/dashboard/auth/refresh",
      payload: { refreshCredential: created.refreshCredential },
    });
    assert.equal(rotated.statusCode, 201);
    const replacement = JSON.parse(rotated.payload);
    assert.notEqual(replacement.refreshCredential, created.refreshCredential);

    const reused = await harness.inject({
      method: "POST",
      url: "/v1/dashboard/auth/refresh",
      payload: { refreshCredential: created.refreshCredential },
    });
    assert.equal(reused.statusCode, 401);
    assert.equal(JSON.parse(reused.payload).error.code, "unauthorized");

    const logout = await harness.inject({
      method: "POST",
      url: "/v1/dashboard/auth/logout",
      headers: authorization(replacement.accessCredential),
    });
    assert.equal(logout.statusCode, 204);

    const revoked = await harness.inject({
      method: "GET",
      url: "/v1/dashboard/me",
      headers: authorization(replacement.accessCredential),
    });
    assert.equal(revoked.statusCode, 401);
    assert.equal(JSON.parse(revoked.payload).error.code, "unauthorized");
  } finally {
    await pool.query('DELETE FROM "User" WHERE email = $1', [input.email]);
    await pool.end();
    await harness.close();
  }
});

test("dashboard auth rejects an access credential after the server-side session expires", async () => {
  const harness = await createTestServer();
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const input = credentials(`${process.pid}-${Date.now()}-expired`);

  try {
    const registered = await harness.inject({ method: "POST", url: "/v1/dashboard/auth/register", payload: input });
    assert.equal(registered.statusCode, 201);
    const created = JSON.parse(registered.payload);

    await pool.query('UPDATE "DashboardSession" SET "expiresAt" = NOW() - interval \'1 second\' WHERE "userId" = $1', [created.user.id]);

    const expired = await harness.inject({
      method: "GET",
      url: "/v1/dashboard/me",
      headers: authorization(created.accessCredential),
    });
    assert.equal(expired.statusCode, 401);
    assert.equal(JSON.parse(expired.payload).error.code, "unauthorized");
  } finally {
    await pool.query('DELETE FROM "User" WHERE email = $1', [input.email]);
    await pool.end();
    await harness.close();
  }
});
