import assert from "node:assert/strict";
import test from "node:test";
import { resolvePath, rowsToRecord, prettyBody } from "../apps/frontend/src/shared/api/try-it-out-helpers.ts";

test("resolvePath interpolates path parameters correctly", () => {
  const template = "/orgs/{org}/repos/{repo}/issues/{id}";
  const params = {
    org: "acme",
    repo: "payments",
    id: "123",
  };
  const result = resolvePath(template, params);
  assert.equal(result, "/orgs/acme/repos/payments/issues/123");
});

test("resolvePath keeps template placeholder if param value is empty/missing", () => {
  const template = "/orgs/{org}/repos/{repo}";
  const params = {
    org: "acme",
    repo: "",
  };
  const result = resolvePath(template, params);
  assert.equal(result, "/orgs/acme/repos/{repo}");
});

test("resolvePath encodes special characters in path parameters", () => {
  const template = "/files/{filename}";
  const params = {
    filename: "hello world/test.json",
  };
  const result = resolvePath(template, params);
  assert.equal(result, "/files/hello%20world%2Ftest.json");
});

test("rowsToRecord converts list of query rows to key-value record", () => {
  const rows = [
    { key: "customerId", value: "cus_123", enabled: true },
    { key: "status", value: "active", enabled: true },
    { key: "ignored", value: "val", enabled: false },
  ];
  const result = rowsToRecord(rows);
  assert.deepEqual(result, {
    customerId: "cus_123",
    status: "active",
  });
});

test("rowsToRecord omits empty values if requested", () => {
  const rows = [
    { key: "customerId", value: "cus_123", enabled: true },
    { key: "empty", value: "", enabled: true },
  ];
  const result = rowsToRecord(rows, { omitEmptyValue: true });
  assert.deepEqual(result, {
    customerId: "cus_123",
  });
});

test("rowsToRecord omits empty keys if requested", () => {
  const rows = [
    { key: "  ", value: "val1", enabled: true },
    { key: "valid", value: "val2", enabled: true },
  ];
  const result = rowsToRecord(rows, { omitEmptyKey: true });
  assert.deepEqual(result, {
    valid: "val2",
  });
});

test("prettyBody formats JSON string with spacing", () => {
  const rawJson = '{"foo":"bar","baz":123}';
  const result = prettyBody(rawJson);
  assert.equal(result, JSON.stringify({ foo: "bar", baz: 123 }, null, 2));
});

test("prettyBody returns raw string if not valid JSON", () => {
  const rawText = "Plain text body";
  const result = prettyBody(rawText);
  assert.equal(result, "Plain text body");
});
