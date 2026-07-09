import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import pg from "pg";
import { test } from "node:test";
import { createTestServer } from "../apps/backend/dist/testing/create-test-server.js";

const execFileAsync = promisify(execFile);
const { Pool } = pg;

test("POST /v1/auth/github/exchange links a GitHub member and returns a deploy-scoped token", async () => {
  await execFileAsync("pnpm", [
    "exec",
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "apps/backend/prisma/schema.prisma",
  ]);

  const suffix = `${process.pid}_${Date.now()}`;
  const userId = `usr_github_${suffix}`;
  const membershipId = `mem_github_${suffix}`;
  const email = `github-${suffix}@example.com`;
  const githubId = `gh_${suffix}`;
  const githubLogin = `octo-${suffix}`;
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });
  const githubServer = await withGithubServer({ email, githubId, githubLogin });
  const previousGithubApiUrl = process.env["GITHUB_API_URL"];
  process.env["GITHUB_API_URL"] = githubServer.url;
  let harness;

  try {
    await pool.query(
      `INSERT INTO "Organization" ("id", "slug", "name", "createdAt", "updatedAt")
       VALUES ('org_acme', 'acme', 'Acme', NOW(), NOW())
       ON CONFLICT ("slug") DO UPDATE SET "updatedAt" = NOW()`,
    );
    await pool.query(
      `INSERT INTO "User" ("id", "email", "name", "passwordHash", "createdAt", "updatedAt")
       VALUES ($1, $2, 'GitHub User', 'test_hash_not_secret', NOW(), NOW())`,
      [userId, email],
    );
    await pool.query(
      `INSERT INTO "Membership" ("id", "organizationId", "userId", "role", "createdAt", "updatedAt")
       VALUES ($1, 'org_acme', $2, 'member', NOW(), NOW())`,
      [membershipId, userId],
    );

    harness = await createTestServer();
    const response = await harness.inject({
      method: "POST",
      url: "/v1/auth/github/exchange",
      payload: {
        githubAccessToken: "test_github_access_token_not_secret",
        organizationSlug: "acme",
      },
    });

    assert.equal(response.statusCode, 201, response.payload);
    const body = JSON.parse(response.payload);
    assert.match(body.id, /^tok_/u);
    assert.match(body.token, /^bumd_live_/u);
    assert.equal(body.name, `github-oauth:${githubLogin}`);
    assert.deepEqual(body.scopes, ["docs:deploy"]);
    const linked = await pool.query('SELECT "githubId", "githubLogin" FROM "User" WHERE "id" = $1', [userId]);
    assert.equal(linked.rows[0]?.githubId, githubId);
    assert.equal(linked.rows[0]?.githubLogin, githubLogin);
  } finally {
    if (harness !== undefined) {
      await harness.close();
    }
    await pool.query('DELETE FROM "Membership" WHERE "id" = $1', [membershipId]).catch(() => undefined);
    await pool.query('DELETE FROM "User" WHERE "id" = $1', [userId]).catch(() => undefined);
    await pool.end();
    await githubServer.close();
    if (previousGithubApiUrl === undefined) {
      delete process.env["GITHUB_API_URL"];
    } else {
      process.env["GITHUB_API_URL"] = previousGithubApiUrl;
    }
  }
});

async function withGithubServer(input) {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/user") {
      response.end(JSON.stringify({ id: input.githubId, login: input.githubLogin, email: null }));
      return;
    }
    if (request.url === "/user/emails") {
      response.end(JSON.stringify([{ email: input.email, primary: true, verified: true }]));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
