import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import pg from "pg";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";

const HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 15_000;
const INVITES = [
  "member_acme:acme:member:2099-01-01T00:00:00.000Z",
  "member_other:other:member:2099-01-01T00:00:00.000Z",
  "guest_acme:acme:guest:2099-01-01T00:00:00.000Z",
].join(",");

async function getOpenPort() {
  const server = createServer();
  server.listen(0, HOST);
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

function startFrontend(port) {
  const child = spawn("pnpm", ["--filter", "@bumd/frontend", "start", "--hostname", HOST, "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      AUTH_SECRET: "test_auth_secret_not_secret_32_chars",
      BUMD_AUTH_TEST_INVITES: INVITES,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  return { baseUrl: `http://${HOST}:${port}`, stop: () => stopChild(child), wait: () => waitUntilReady(child, `http://${HOST}:${port}`) };
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") child.kill("SIGTERM");
  else process.kill(-child.pid, "SIGTERM");
  await Promise.race([once(child, "close"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
    await once(child, "close");
  }
}

async function waitUntilReady(child, baseUrl) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`frontend exited with ${child.exitCode}`);
    try {
      await fetch(baseUrl, { redirect: "manual" });
      await new Promise((resolve) => setTimeout(resolve, 500));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("frontend did not start");
}

async function withFrontend(callback) {
  const frontend = startFrontend(await getOpenPort());
  try {
    await frontend.wait();
    await callback(frontend.baseUrl);
  } finally {
    await frontend.stop();
  }
}

async function request(baseUrl, path, options = {}, jar = new Map()) {
  const headers = new Headers(options.headers);
  const cookies = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  if (cookies.length > 0) headers.set("cookie", cookies);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
  return { response, body: await response.text() };
}

function form(data) {
  return new URLSearchParams(data).toString();
}

async function signupLoginAndInvite(baseUrl, email, inviteToken) {
  const jar = new Map();
  await request(baseUrl, "/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ email, password: "correct horse battery", name: email }),
  }, jar);
  await request(baseUrl, "/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ email, password: "correct horse battery", callbackUrl: "/app" }),
  }, jar);
  await request(baseUrl, `/accept-invite/${inviteToken}`, {}, jar);
  return jar;
}

test("dashboard lists only member org docs and blocks cross org access", async () => {
  await withFrontend(async (baseUrl) => {
    const anonymous = await request(baseUrl, "/app/acme/docs");
    assert.equal(anonymous.response.status, 307);
    assert.match(anonymous.response.headers.get("location") ?? "", /\/login/u);

    const jar = await signupLoginAndInvite(baseUrl, "member@example.com", "member_acme");
    const acme = await request(baseUrl, "/app/acme/docs", {}, jar);
    assert.equal(acme.response.status, 200);
    assert.match(acme.body, /Payments API/u);
    assert.doesNotMatch(acme.body, /Other API/u);

    const other = await request(baseUrl, "/app/other/docs", {}, jar);
    assert.equal(other.response.status, 307);
    assert.doesNotMatch(other.body, /Other API/u);
  });
});

test("member creates doc and sees it in dashboard list", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "creator@example.com", "member_acme");
    const created = await request(baseUrl, "/app/acme/docs/new", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ name: "Ledger API", slug: "ledger", visibility: "private", theme: "clean" }),
    }, jar);
    assert.equal(created.response.status, 303);
    assert.match(created.response.headers.get("location") ?? "", /\/app\/acme\/docs\/ledger/u);

    const list = await request(baseUrl, "/app/acme/docs", {}, jar);
    assert.equal(list.response.status, 200);
    assert.match(list.body, /Ledger API/u);
    assert.match(list.body, /private/u);
  });
});

test("guest cannot access create or settings actions", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "guest@example.com", "guest_acme");
    const list = await request(baseUrl, "/app/acme/docs", {}, jar);
    assert.equal(list.response.status, 200);
    assert.doesNotMatch(list.body, /New doc/u);
    assert.doesNotMatch(list.body, /Settings/u);

    const create = await request(baseUrl, "/app/acme/docs/new", {}, jar);
    assert.equal(create.response.status, 307);
    const settings = await request(baseUrl, "/app/acme/docs/payments/settings", {}, jar);
    assert.equal(settings.response.status, 307);
  });
});

test("dashboard doc overview shows current status and public portal url", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "overview@example.com", "member_acme");
    const overview = await request(baseUrl, "/app/acme/docs/payments", {}, jar);
    assert.equal(overview.response.status, 200);
    assert.match(overview.body, /Payments API/u);
    assert.match(overview.body, /current status: processing/u);
    assert.match(overview.body, /href="\/acme\/payments"/u);
  });
});

test("settings updates visibility and theme for managers only", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "settings@example.com", "member_acme");
    const updated = await request(baseUrl, "/app/acme/docs/payments/settings", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ visibility: "private", theme: "midnight" }),
    }, jar);
    assert.ok([303, 307].includes(updated.response.status));
    assert.match(updated.response.headers.get("location") ?? "", /\/app\/acme\/docs\/payments/u);

    const overview = await request(baseUrl, "/app/acme/docs/payments", {}, jar);
    assert.equal(overview.response.status, 200);
    assert.match(overview.body, /private/u);
    assert.match(overview.body, /midnight/u);
  });
});

test("version history renders newest first without mutation actions", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "versions@example.com", "member_acme");
    const history = await request(baseUrl, "/app/acme/docs/payments/versions", {}, jar);
    assert.equal(history.response.status, 200);
    assert.ok(history.body.indexOf("v3") < history.body.indexOf("v2"));
    assert.ok(history.body.indexOf("v2") < history.body.indexOf("v1"));
    assert.doesNotMatch(history.body, /Delete version|Edit version/u);
  });
});

test("api tokens dashboard UI list, create, and revoke workflow", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "tokens-ui@example.com", "member_acme");
    
    // 1. Get tokens list page
    const listPage = await request(baseUrl, "/app/acme/api-tokens", {}, jar);
    assert.equal(listPage.response.status, 200);
    assert.match(listPage.body, /Active API Tokens/u);

    // 2. Create token via Route Handler POST
    const createRes = await request(baseUrl, "/app/acme/api-tokens/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "CI test token", role: "member", scopes: ["docs:read", "docs:deploy"] }),
    }, jar);
    assert.equal(createRes.response.status, 200);
    const created = JSON.parse(createRes.body);
    assert.ok(created.token);
    assert.equal(created.apiToken.name, "CI test token");

    // 3. Verify it is listed in the HTML page now
    const listPageAfter = await request(baseUrl, "/app/acme/api-tokens", {}, jar);
    assert.equal(listPageAfter.response.status, 200);
    assert.match(listPageAfter.body, /CI test token/u);

    // 4. Revoke token via Route Handler POST
    const revokeRes = await request(baseUrl, "/app/acme/api-tokens/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenId: created.apiToken.id }),
    }, jar);
    assert.equal(revokeRes.response.status, 200);
    assert.equal(JSON.parse(revokeRes.body).status, "revoked");

    // 5. Verify it is no longer listed
    const listPageFinal = await request(baseUrl, "/app/acme/api-tokens", {}, jar);
    assert.equal(listPageFinal.response.status, 200);
    assert.doesNotMatch(listPageFinal.body, /CI test token/u);
  });
});

test("members and invites dashboard UI workflow", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "members-ui@example.com", "member_acme");

    // 1. Get members list page
    const listPage = await request(baseUrl, "/app/acme/members", {}, jar);
    assert.equal(listPage.response.status, 200);
    assert.match(listPage.body, /Organization Members/u);
    assert.match(listPage.body, /members-ui@example\.com/u);

    // 2. Create invite via POST
    const inviteRes = await request(baseUrl, "/app/acme/members/invite-create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new-invited@example.com", role: "member" }),
    }, jar);
    assert.equal(inviteRes.response.status, 200);
    const created = JSON.parse(inviteRes.body);
    assert.ok(created.token);
    assert.equal(created.invite.email, "new-invited@example.com");

    // 3. Verify it is listed in the pending invites
    const listPageAfter = await request(baseUrl, "/app/acme/members", {}, jar);
    assert.equal(listPageAfter.response.status, 200);
    assert.match(listPageAfter.body, /new-invited@example\.com/u);

    // 4. Revoke invite via POST
    const revokeRes = await request(baseUrl, "/app/acme/members/invite-revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteId: created.invite.id }),
    }, jar);
    assert.equal(revokeRes.response.status, 200);

    // 5. Verify it is no longer active (status revoked)
    const listPageFinal = await request(baseUrl, "/app/acme/members", {}, jar);
    assert.equal(listPageFinal.response.status, 200);
    assert.match(listPageFinal.body, /revoked/u);
  });
});

test("webhooks dashboard UI workflow", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "webhooks-ui@example.com", "member_acme");

    // 1. Get webhooks list page
    const listPage = await request(baseUrl, "/app/acme/webhooks", {}, jar);
    assert.equal(listPage.response.status, 200);
    assert.match(listPage.body, /Configured Endpoints/u);

    // 2. Create webhook via POST
    const createRes = await request(baseUrl, "/app/acme/webhooks/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/webhooks-ui-test", description: "UI test hook", eventTypes: ["version.created"] }),
    }, jar);
    assert.equal(createRes.response.status, 200);
    const created = JSON.parse(createRes.body);
    assert.ok(created.secret);
    assert.equal(created.webhook.url, "https://example.com/webhooks-ui-test");

    // 3. Verify it is listed in the HTML page now
    const listPageAfter = await request(baseUrl, "/app/acme/webhooks", {}, jar);
    assert.equal(listPageAfter.response.status, 200);
    assert.match(listPageAfter.body, /webhooks-ui-test/u);

    // 4. Update webhook via POST
    const updateRes = await request(baseUrl, "/app/acme/webhooks/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ webhookId: created.webhook.id, url: "https://example.com/webhooks-ui-updated", enabled: false, eventTypes: ["version.failed"] }),
    }, jar);
    assert.equal(updateRes.response.status, 200);

    // 5. Rotate secret
    const rotateRes = await request(baseUrl, "/app/acme/webhooks/rotate-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ webhookId: created.webhook.id }),
    }, jar);
    assert.equal(rotateRes.response.status, 200);
    assert.ok(JSON.parse(rotateRes.body).secret);

    // 6. Delete webhook
    const deleteRes = await request(baseUrl, "/app/acme/webhooks/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ webhookId: created.webhook.id }),
    }, jar);
    assert.equal(deleteRes.response.status, 200);

    // 7. Verify it is no longer listed
    const listPageFinal = await request(baseUrl, "/app/acme/webhooks", {}, jar);
    assert.equal(listPageFinal.response.status, 200);
    assert.doesNotMatch(listPageFinal.body, /webhooks-ui-test/u);
  });
});

test("doc settings repository linking and branch mappings workflow", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = await signupLoginAndInvite(baseUrl, "repo-linking@example.com", "member_acme");
    const pool = new pg.Pool({ connectionString: DATABASE_URL });

    try {
      // Seed GitHub installation first
      await pool.query(
        `INSERT INTO "GithubInstallation" (id, "organizationId", "githubInstallationId", "accountName", "createdAt", "updatedAt")
         VALUES ('ghinst_001', 'org_acme', 'inst_001', 'octo', NOW(), NOW())
         ON CONFLICT ("githubInstallationId") DO NOTHING`
      );

      // 1. Get settings page and verify GitHub section exists
      const settingsPage = await request(baseUrl, "/app/acme/docs/payments/settings", {}, jar);
      assert.equal(settingsPage.response.status, 200);
      assert.match(settingsPage.body, /GitHub Integration/u);
      assert.match(settingsPage.body, /Link new repository/u);

      // 2. Link a repository via POST (create_and_link_repo action)
      const linkRes = await request(baseUrl, "/app/acme/docs/payments/settings", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "create_and_link_repo",
          githubInstallationId: "inst_001",
          githubRepoId: "998877",
          fullName: "octo/linked-repo-test",
        }).toString(),
      }, jar);
      assert.equal(linkRes.response.status, 303);

      // 3. Verify it is now linked on settings page
      const settingsAfter = await request(baseUrl, "/app/acme/docs/payments/settings", {}, jar);
      assert.equal(settingsAfter.response.status, 200);
      assert.match(settingsAfter.body, /octo\/linked-repo-test/u);
      assert.match(settingsAfter.body, /Branch & Spec Path Mappings/u);

      // 4. Create branch mapping
      const mapRes = await request(baseUrl, "/app/acme/docs/payments/settings", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "create_mapping",
          githubRepoId: "998877",
          branchName: "staging",
          specPath: "api/openapi.yaml",
        }).toString(),
      }, jar);
      assert.equal(mapRes.response.status, 303);

      // 5. Verify mapping is listed
      const settingsMapped = await request(baseUrl, "/app/acme/docs/payments/settings", {}, jar);
      assert.equal(settingsMapped.response.status, 200);
      assert.match(settingsMapped.body, /staging/u);
      assert.match(settingsMapped.body, /api\/openapi.yaml/u);

      // Fetch repository ID from DB
      const repoRes = await pool.query('SELECT id FROM "GithubRepository" WHERE "githubRepoId" = \'998877\'');
      const repoId = repoRes.rows[0].id;

      // 6. Unlink repository
      const unlinkRes = await request(baseUrl, "/app/acme/docs/payments/settings", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "unlink_repo",
          repoId,
        }).toString(),
      }, jar);
      assert.equal(unlinkRes.response.status, 303);

      // 7. Verify unlinked
      const settingsFinal = await request(baseUrl, "/app/acme/docs/payments/settings", {}, jar);
      assert.equal(settingsFinal.response.status, 200);
      assert.doesNotMatch(settingsFinal.body, /Linked Repository:/u);
    } finally {
      await pool.end();
    }
  });
});
