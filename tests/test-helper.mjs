import assert from "node:assert/strict";

export async function createTestServer() {
  process.env["DEPLOY_STORE"] = "memory";
  process.env["API_TOKEN_STORE"] = "memory";
  process.env["WEBHOOK_DELIVERY_STORE"] = "memory";
  process.env["DATABASE_URL"] ??= "postgresql://bumd:bumd@localhost:5436/bumd";
  process.env["BUMD_ADMIN_SESSION_TOKEN"] = "test_admin_session_not_secret";
  process.env["BUMD_ADMIN_SESSION_ORGS"] = "*";
  process.env["CDN_ACCOUNT_ID"] = "test_account_not_secret";
  process.env["CDN_ACCESS_KEY_ID"] = "test_access_key_not_secret";
  process.env["CDN_SECRET_ACCESS_KEY"] = "test_secret_key_not_secret";
  process.env["CDN_BUCKET_NAME"] = "test_bucket";
  const module = await import("../apps/backend/dist/testing/create-test-server.js");
  return module.createTestServer();
}

export async function createApiToken(harness, role, org = "acme", name = "management token") {
  const response = await harness.inject({
    method: "POST",
    url: `/v1/orgs/${org}/api-tokens`,
    headers: { Authorization: "Bearer test_admin_session_not_secret" },
    payload: {
      name,
      role,
      scopes: ["docs:read", "docs:deploy"],
    },
  });
  assert.equal(response.statusCode, 201, response.payload);
  return JSON.parse(response.payload).token;
}
