import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

const HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 15_000;

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
  const child = spawn("pnpm", ["--filter", "@bumd/frontend", "dev", "--hostname", HOST, "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      AUTH_SECRET: "test_auth_secret_not_secret_32_chars",
      BUMD_AUTH_TEST_INVITES: "invite_ok:acme:member:2099-01-01T00:00:00.000Z,invite_expired:acme:admin:2000-01-01T00:00:00.000Z",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
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

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function storeCookies(jar, response) {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

async function request(baseUrl, path, options = {}, jar = new Map()) {
  const headers = new Headers(options.headers);
  const cookies = cookieHeader(jar);
  if (cookies.length > 0) headers.set("cookie", cookies);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  storeCookies(jar, response);
  return { response, body: await response.text() };
}

function form(data) {
  return new URLSearchParams(data).toString();
}

test("signup and login establish session and app access", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = new Map();
    const signup = await request(baseUrl, "/signup", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: "owner@example.com", password: "correct horse battery", name: "Owner" }),
    }, jar);
    assert.equal(signup.response.status, 303);

    const login = await request(baseUrl, "/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: "owner@example.com", password: "correct horse battery", callbackUrl: "/app" }),
    }, jar);
    assert.equal(login.response.status, 303);
    assert.match(login.response.headers.get("location") ?? "", /\/app/u);

    const app = await request(baseUrl, "/app", {}, jar);
    assert.equal(app.response.status, 200);
    assert.match(app.body, /owner@example\.com/u);
  });
});

test("login form escapes callback url attributes", async () => {
  await withFrontend(async (baseUrl) => {
    const hostileCallback = encodeURIComponent('/app" autofocus onfocus="alert(1)');
    const login = await request(baseUrl, `/login?callbackUrl=${hostileCallback}`);
    assert.equal(login.response.status, 200);
    assert.doesNotMatch(login.body, /value="\/app" autofocus/u);
    assert.match(login.body, /value="\/app&quot; autofocus onfocus=&quot;alert\(1\)"/u);
  });
});

test("app redirects unauthenticated users and logout clears session", async () => {
  await withFrontend(async (baseUrl) => {
    const anonymous = await request(baseUrl, "/app/acme");
    assert.equal(anonymous.response.status, 307);
    assert.match(anonymous.response.headers.get("location") ?? "", /\/login/u);

    const jar = new Map();
    await request(baseUrl, "/signup", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: "logout@example.com", password: "correct horse battery", name: "Logout" }),
    }, jar);
    await request(baseUrl, "/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: "logout@example.com", password: "correct horse battery", callbackUrl: "/app" }),
    }, jar);

    const logout = await request(baseUrl, "/logout", { method: "POST" }, jar);
    assert.ok([303, 307].includes(logout.response.status));
    const after = await request(baseUrl, "/app", {}, jar);
    assert.equal(after.response.status, 307);
    assert.match(after.response.headers.get("location") ?? "", /\/login/u);
  });
});

test("accept invite attaches membership and rejects invalid token", async () => {
  await withFrontend(async (baseUrl) => {
    const jar = new Map();
    await request(baseUrl, "/signup", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: "invite@example.com", password: "correct horse battery", name: "Invite" }),
    }, jar);
    await request(baseUrl, "/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ email: "invite@example.com", password: "correct horse battery", callbackUrl: "/app" }),
    }, jar);

    const accepted = await request(baseUrl, "/accept-invite/invite_ok", {}, jar);
    assert.ok([303, 307].includes(accepted.response.status));
    assert.match(accepted.response.headers.get("location") ?? "", /\/app\/acme/u);

    const org = await request(baseUrl, "/app/acme", {}, jar);
    assert.equal(org.response.status, 200);
    assert.match(org.body, /member/u);

    const invalid = await request(baseUrl, "/accept-invite/not-a-token", {}, jar);
    assert.equal(invalid.response.status, 400);
    assert.doesNotMatch(invalid.body, /not-a-token/u);

    const expired = await request(baseUrl, "/accept-invite/invite_expired", {}, jar);
    assert.equal(expired.response.status, 400);
  });
});
