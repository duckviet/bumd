import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".js") && context.parentURL?.includes("/apps/backend/src/")) {
      const sourceUrl = new URL(specifier.replace(/\.js$/u, ".ts"), context.parentURL);
      if (existsSync(fileURLToPath(sourceUrl))) {
        return { shortCircuit: true, url: sourceUrl.href };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url.endsWith(".ts") && loaded.source !== null && loaded.source !== undefined) {
      const source = typeof loaded.source === "string"
        ? loaded.source
        : Buffer.from(loaded.source).toString("utf8");
      return {
        ...loaded,
        source: stripTypeScriptTypes(source, { mode: "transform", sourceMap: true }),
      };
    }
    return loaded;
  },
});

const { collectTemplateRefs, collectedRefsToInputs, interpolate } = await import(
  "../apps/backend/src/test-workflows/runner/test-workflow-template.ts"
);
const { validateDefinitionForRun } = await import(
  "../apps/backend/src/test-workflows/runner/test-workflow-validator.ts"
);

const operationSpec = {
  paths: {
    "/items": {
      get: { operationId: "listItems" },
    },
  },
};

function node(id, requestTemplate, exports = []) {
  return {
    id,
    type: "endpoint",
    operationId: "listItems",
    method: "GET",
    path: "/items",
    label: id,
    phase: "test",
    position: { x: 0, y: 0 },
    requestTemplate,
    exports,
    assertions: [],
  };
}

test("characterizes existing env and vars interpolation and reference collection", () => {
  const secretKeys = new Set(["TOKEN"]);
  const context = {
    vars: { itemId: 42, payload: { ok: true } },
    env: { TOKEN: "test_token_not_secret", REGION: "west" },
    data: {},
    secretKeys,
  };
  const refs = [];

  const resolved = interpolate(
    {
      authorization: "Bearer {{env.TOKEN}}",
      region: "{{env.REGION}}",
      itemId: "{{vars.itemId}}",
    },
    context,
    refs,
  );

  assert.deepEqual(resolved, {
    authorization: "Bearer test_token_not_secret",
    region: "west",
    itemId: 42,
  });
  assert.deepEqual(refs, [
    { kind: "env", key: "TOKEN", isSecret: true },
    { kind: "env", key: "REGION", isSecret: false },
    { kind: "var", name: "itemId", value: 42 },
  ]);
  assert.deepEqual(
    collectTemplateRefs({ header: "{{env.REGION}}", path: "/{{vars.itemId}}" }),
    { dataRefs: [], envRefs: ["REGION"], varRefs: ["itemId"] },
  );
});

test("characterizes ancestor-only vars and environment requirements", () => {
  const definition = {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [
      node("producer", {}, [{ name: "itemId", source: "status" }]),
      node("consumer", { query: { id: "{{vars.itemId}}", region: "{{env.REGION}}" } }),
    ],
    edges: [{ id: "producer-consumer", source: "producer", target: "consumer" }],
  };

  assert.doesNotThrow(() => validateDefinitionForRun(definition, operationSpec, new Set(["REGION"])));

  const disconnected = { ...definition, edges: [] };
  assert.throws(
    () => validateDefinitionForRun(disconnected, operationSpec, new Set(["REGION"])),
    (error) => error.code === "VAR_REF_NOT_ANCESTOR",
  );
  assert.throws(
    () => validateDefinitionForRun(definition, operationSpec, new Set()),
    (error) => error.code === "ENV_VAR_MISSING",
  );
});

test("preserves pure data JSON types and embeds data scalars", () => {
  const frozenData = Object.freeze({
    text: "saved",
    count: 7,
    enabled: true,
    empty: null,
    object: Object.freeze({ nested: "value" }),
    array: Object.freeze([1, "two"]),
  });
  const context = {
    vars: { itemId: 42 },
    env: { REGION: "west" },
    data: frozenData,
    secretKeys: new Set(),
  };
  const refs = [];

  const resolved = interpolate(
    {
      allNamespaces: "{{env.REGION}}/{{data.text}}/{{vars.itemId}}",
      text: "{{data.text}}",
      count: "{{data.count}}",
      enabled: "{{data.enabled}}",
      empty: "{{data.empty}}",
      object: "{{data.object}}",
      array: "{{data.array}}",
      embedded: "count={{data.count}}, enabled={{data.enabled}}, empty={{data.empty}}",
    },
    context,
    refs,
  );

  assert.deepEqual(resolved, {
    allNamespaces: "west/saved/42",
    text: "saved",
    count: 7,
    enabled: true,
    empty: null,
    object: { nested: "value" },
    array: [1, "two"],
    embedded: "count=7, enabled=true, empty=",
  });
  assert.deepEqual(
    refs.filter((ref) => ref.kind === "data"),
    [
      { kind: "data", key: "text", value: "saved" },
      { kind: "data", key: "text", value: "saved" },
      { kind: "data", key: "count", value: 7 },
      { kind: "data", key: "enabled", value: true },
      { kind: "data", key: "empty", value: null },
      { kind: "data", key: "object", value: { nested: "value" } },
      { kind: "data", key: "array", value: [1, "two"] },
      { kind: "data", key: "count", value: 7 },
      { kind: "data", key: "enabled", value: true },
      { kind: "data", key: "empty", value: null },
    ],
  );
  assert.deepEqual(
    collectedRefsToInputs(refs, context.env).filter((input) => input.type === "data"),
    refs
      .filter((ref) => ref.kind === "data")
      .map((ref) => ({ type: "data", key: ref.key, value: ref.value })),
  );
  assert.deepEqual(frozenData, {
    text: "saved",
    count: 7,
    enabled: true,
    empty: null,
    object: { nested: "value" },
    array: [1, "two"],
  });
});

test("collects data refs and ignores malformed or unsupported namespaces", () => {
  const unsupportedTemplates = {
    unsupported: "{{secrets.TOKEN}}",
    missingNamespace: "{{customerId}}",
    malformed: "{{data.customer-id}}",
  };

  assert.deepEqual(
    collectTemplateRefs({
      valid: "{{data.customerId}}",
      repeated: "{{data.customerId}}/{{env.REGION}}/{{vars.itemId}}",
      ...unsupportedTemplates,
    }),
    { dataRefs: ["customerId"], envRefs: ["REGION"], varRefs: ["itemId"] },
  );
  assert.deepEqual(
    interpolate(unsupportedTemplates, { vars: {}, env: {}, data: {}, secretKeys: new Set() }),
    unsupportedTemplates,
  );
});

test("rejects missing data during run validation with a stable code", () => {
  const definition = {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [node("consumer", { query: { id: "{{data.customerId}}" } })],
    edges: [],
  };

  assert.throws(
    () => validateDefinitionForRun(definition, operationSpec, new Set()),
    (error) => error.code === "TEST_DATA_MISSING",
  );
  assert.throws(
    () => interpolate("{{data.customerId}}", { vars: {}, env: {}, data: {}, secretKeys: new Set() }),
    (error) => error.code === "TEST_DATA_MISSING",
  );
});

test("rejects structured data embedded in strings with VAR_REF_INVALID", () => {
  const context = {
    vars: {},
    env: {},
    data: { object: { nested: true }, array: [1, 2] },
    secretKeys: new Set(),
  };

  for (const template of ["object={{data.object}}", "array={{data.array}}"]) {
    assert.throws(
      () => interpolate(template, context),
      (error) => error.code === "VAR_REF_INVALID",
    );
  }
});

test("records data as non-secret while preserving env secret redaction", () => {
  const sameValue = "test_token_not_secret";
  const inputs = collectedRefsToInputs(
    [
      { kind: "env", key: "TOKEN", isSecret: true },
      { kind: "data", key: "fixtureToken", value: sameValue },
    ],
    { TOKEN: sameValue },
  );

  assert.deepEqual(inputs, [
    { type: "env", key: "TOKEN", value: "[REDACTED]" },
    { type: "data", key: "fixtureToken", value: sameValue },
  ]);
});
