import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { createTestServer } from "../apps/backend/dist/testing/create-test-server.js";

test("exchanges valid GitHub Actions OIDC claims for a deploy-scoped API token", async () => {
  const jwtFixture = await createJwtFixture(validGithubClaims());
  const previousJwksUrl = process.env.GITHUB_OIDC_JWKS_URL;
  process.env.GITHUB_OIDC_JWKS_URL = jwtFixture.jwksUrl;
  const harness = await createTestServer();
  try {
    const response = await harness.inject({
      method: "POST",
      url: "/v1/auth/github/oidc-token",
      payload: {
        token: jwtFixture.jwt,
        organizationSlug: "acme",
        repository: "octo/payments",
        ref: "refs/heads/main",
      },
    });

    assert.equal(response.statusCode, 201, response.payload);
    const body = JSON.parse(response.payload);
    assert.match(body.id, /^tok_/u);
    assert.match(body.token, /^bumd_live_/u);
    assert.equal(body.tokenPrefix, body.token.slice(0, 16));
    assert.equal(body.name, "github-actions:octo/payments");
    assert.deepEqual(body.scopes, ["docs:deploy"]);

    const metadata = harness.apiTokenMetadata(body.id);
    assert.equal(metadata?.organizationId, "acme");
    assert.deepEqual(metadata?.scopes, ["docs:deploy"]);
    assert.equal(JSON.stringify(metadata).includes(body.token), false);
  } finally {
    await harness.close();
    await jwtFixture.close();
    restoreEnv("GITHUB_OIDC_JWKS_URL", previousJwksUrl);
  }
});

test("rejects malformed GitHub Actions OIDC exchange bodies without leaking the token", async () => {
  const harness = await createTestServer({
    githubOidcVerifier: {
      verify: async () => validGithubClaims(),
    },
  });
  try {
    const response = await harness.inject({
      method: "POST",
      url: "/v1/auth/github/oidc-token",
      payload: {
        token: "test_github_oidc_token_not_secret",
        repository: "octo/payments",
      },
    });

    assert.equal(response.statusCode, 400, response.payload);
    assert.equal(response.payload.includes("test_github_oidc_token_not_secret"), false);
  } finally {
    await harness.close();
  }
});

test("rejects GitHub OIDC claims for an unauthorized repository owner", async () => {
  const harness = await createTestServer({
    githubOidcVerifier: {
      verify: async () =>
        validGithubClaims({
          repository: "evil/repo",
          repository_owner: "evil",
          sub: "repo:evil/repo:ref:refs/heads/main",
        }),
    },
  });
  try {
    const response = await harness.inject({
      method: "POST",
      url: "/v1/auth/github/oidc-token",
      payload: {
        token: "test_github_oidc_token_not_secret",
        organizationSlug: "acme",
        repository: "evil/repo",
        ref: "refs/heads/main",
      },
    });

    assert.equal(response.statusCode, 403, response.payload);
    assert.equal(JSON.parse(response.payload).error.code, "forbidden");
  } finally {
    await harness.close();
  }
});

test("rejects GitHub OIDC claims for an unauthorized ref", async () => {
  const harness = await createTestServer({
    githubOidcVerifier: {
      verify: async () =>
        validGithubClaims({
          ref: "refs/heads/feature",
          sub: "repo:octo/payments:ref:refs/heads/feature",
        }),
    },
  });
  try {
    const response = await harness.inject({
      method: "POST",
      url: "/v1/auth/github/oidc-token",
      payload: {
        token: "test_github_oidc_token_not_secret",
        organizationSlug: "acme",
        repository: "octo/payments",
        ref: "refs/heads/feature",
      },
    });

    assert.equal(response.statusCode, 403, response.payload);
    assert.equal(JSON.parse(response.payload).error.code, "forbidden");
  } finally {
    await harness.close();
  }
});

test("rejects expired signed GitHub OIDC JWTs", async () => {
  const now = Math.floor(Date.now() / 1000);
  const jwtFixture = await createJwtFixture(
    validGithubClaims({
      iat: now - 400,
      exp: now - 60,
    }),
  );
  const previousJwksUrl = process.env.GITHUB_OIDC_JWKS_URL;
  process.env.GITHUB_OIDC_JWKS_URL = jwtFixture.jwksUrl;
  const harness = await createTestServer();
  try {
    const response = await harness.inject({
      method: "POST",
      url: "/v1/auth/github/oidc-token",
      payload: {
        token: jwtFixture.jwt,
        organizationSlug: "acme",
        repository: "octo/payments",
        ref: "refs/heads/main",
      },
    });

    assert.equal(response.statusCode, 401, response.payload);
    assert.equal(JSON.parse(response.payload).error.code, "unauthorized");
  } finally {
    await harness.close();
    await jwtFixture.close();
    restoreEnv("GITHUB_OIDC_JWKS_URL", previousJwksUrl);
  }
});

function validGithubClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://token.actions.githubusercontent.com",
    aud: "bumd",
    sub: "repo:octo/payments:ref:refs/heads/main",
    repository: "octo/payments",
    repository_owner: "octo",
    ref: "refs/heads/main",
    iat: now,
    nbf: now - 5,
    exp: now + 300,
    ...overrides,
  };
}

async function createJwtFixture(claims) {
  const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "test-key";
  const publicJwk = keyPair.publicKey.export({ format: "jwk" });
  const server = createServer((_, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ keys: [{ ...publicJwk, kid, alg: "RS256" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  return {
    jwt: signJwt(keyPair.privateKey, kid, claims),
    jwksUrl: `http://127.0.0.1:${address.port}/jwks`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))),
  };
}

function signJwt(privateKey, kid, claims) {
  const header = base64UrlJson({ alg: "RS256", typ: "JWT", kid });
  const payload = base64UrlJson(claims);
  const input = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(input).end().sign(privateKey).toString("base64url");
  return `${input}.${signature}`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
