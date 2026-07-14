import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAndValidateDefinition,
  WorkflowTagsSchema,
} from "../apps/backend/src/test-workflows/test-workflow-definition.schema.ts";

function node(id, exports = []) {
  return {
    id,
    type: "endpoint",
    operationId: `operation_${id}`,
    method: "GET",
    path: `/${id}`,
    label: id,
    position: { x: 0, y: 0 },
    requestTemplate: {},
    exports,
    assertions: [],
  };
}

test("normalizes v1 without mutating the stored input", () => {
  // Given
  const input = Object.freeze({
    schemaVersion: 1,
    nodes: Object.freeze([
      Object.freeze(node("first", [{ name: "token", source: "body", path: "$.token" }])),
    ]),
    edges: Object.freeze([]),
    viewport: { x: 1, y: 2, zoom: 1.25 },
  });

  // When
  const firstParse = parseAndValidateDefinition(input);
  const secondParse = parseAndValidateDefinition(input);

  // Then
  const expected = {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [{ ...node("first", [{ name: "token", source: "body", path: "$.token" }]), phase: "test" }],
    edges: [],
    viewport: { x: 1, y: 2, zoom: 1.25 },
  };
  assert.deepEqual(firstParse, expected);
  assert.deepEqual(secondParse, expected);
  assert.equal(input.schemaVersion, 1);
  assert.equal("phase" in input.nodes[0], false);
});

test("preserves a strict v2 definition with JSON-safe test data", () => {
  // Given
  const input = {
    schemaVersion: 2,
    context: {
      testData: {
        user_id: 42,
        enabled: true,
        nullable: null,
        profile: { roles: ["reader", "writer"] },
      },
    },
    nodes: [
      { ...node("prepare"), phase: "setup" },
      { ...node("verify"), phase: "test" },
      { ...node("cleanup"), phase: "teardown" },
    ],
    edges: [
      { id: "prepare-verify", source: "prepare", target: "verify" },
      { id: "verify-cleanup", source: "verify", target: "cleanup" },
    ],
  };

  // When
  const parsed = parseAndValidateDefinition(input);

  // Then
  assert.deepEqual(parsed, input);
});

test("rejects invalid, excessive, and oversized test data", () => {
  // Given
  const base = { schemaVersion: 2, nodes: [], edges: [] };
  const excessiveEntries = Object.fromEntries(
    Array.from({ length: 101 }, (_, index) => [`key_${index}`, index]),
  );
  const invalidCases = [
    [{ ...base, context: { testData: { "not-valid": 1 } } }, /valid identifier/u],
    [{ ...base, context: { testData: excessiveEntries } }, /at most 100 entries/u],
    [{ ...base, context: { testData: { too_large: "x".repeat(65_537) } } }, /at most 64 KiB/u],
    [{ ...base, context: { testData: { undefined_value: undefined } } }, /Invalid input/u],
    [{ ...base, context: { testData: { non_finite: Number.POSITIVE_INFINITY } } }, /Invalid input/u],
    [{ ...base, context: { testData: { bigint_value: 1n } } }, /Invalid input/u],
    [{ ...base, context: { testData: { date_value: new Date("2026-07-14T00:00:00Z") } } }, /Invalid input/u],
  ];

  // When / Then
  for (const [invalid, expectedError] of invalidCases) {
    assert.throws(() => parseAndValidateDefinition(invalid), expectedError);
  }
});

test("normalizes valid workflow metadata tags", () => {
  // Given
  const longTag = `long-${"x".repeat(100)}`;
  const input = [
    "  Smoke-Test  ",
    "payments",
    ...Array.from({ length: 21 }, () => "smoke-test"),
    longTag,
  ];

  // When
  const parsed = WorkflowTagsSchema.parse(input);

  // Then
  assert.deepEqual(parsed, ["smoke-test", "payments", longTag]);
});

test("rejects malformed workflow metadata tags with stable details", () => {
  // Given
  const malformedCases = [
    [["has spaces"], /lowercase alphanumeric/u],
    [["UPPERCASE_AFTER_NORMALIZATION!"], /lowercase alphanumeric/u],
  ];

  // When / Then
  for (const [input, expectedError] of malformedCases) {
    assert.throws(() => WorkflowTagsSchema.parse(input), expectedError);
  }
});

test("rejects phase-regressing edges", () => {
  // Given
  const invalidEdges = [
    ["test", "setup"],
    ["teardown", "test"],
    ["teardown", "setup"],
  ];

  // When / Then
  for (const [sourcePhase, targetPhase] of invalidEdges) {
    const definition = {
      schemaVersion: 2,
      context: { testData: {} },
      nodes: [
        { ...node("source"), phase: sourcePhase },
        { ...node("target"), phase: targetPhase },
      ],
      edges: [{ id: "edge", source: "source", target: "target" }],
    };
    assert.throws(
      () => parseAndValidateDefinition(definition),
      /Invalid phase edge: source \([^)]*\) -> target \([^)]*\)/u,
    );
  }
});

test("rejects duplicate graph keys and unknown v2 fields", () => {
  // Given
  const duplicateNodeIds = {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [{ ...node("same"), phase: "test" }, { ...node("same"), phase: "test" }],
    edges: [],
  };
  const duplicateEdgeIds = {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [{ ...node("first"), phase: "test" }, { ...node("second"), phase: "test" }],
    edges: [
      { id: "same", source: "first", target: "second" },
      { id: "same", source: "first", target: "second" },
    ],
  };
  const unknownV2Field = {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [],
    edges: [],
    futureBehavior: true,
  };
  const unknownV2NodeField = {
    schemaVersion: 2,
    context: { testData: {} },
    nodes: [{ ...node("first"), phase: "test", futureBehavior: true }],
    edges: [],
  };

  // When / Then
  assert.throws(() => parseAndValidateDefinition(duplicateNodeIds), /Duplicate node id: same/u);
  assert.throws(() => parseAndValidateDefinition(duplicateEdgeIds), /Duplicate edge id: same/u);
  assert.throws(() => parseAndValidateDefinition(unknownV2Field), /Unrecognized key/u);
  assert.throws(() => parseAndValidateDefinition(unknownV2NodeField), /Unrecognized key/u);
});

test("retains existing graph and export validation invariants", () => {
  // Given
  const duplicateExports = {
    schemaVersion: 1,
    nodes: [
      node("first", [{ name: "shared", source: "status" }]),
      node("second", [{ name: "shared", source: "status" }]),
    ],
    edges: [],
  };
  const cycle = {
    schemaVersion: 1,
    nodes: [node("first"), node("second")],
    edges: [
      { id: "one", source: "first", target: "second" },
      { id: "two", source: "second", target: "first" },
    ],
  };

  // When / Then
  assert.throws(() => parseAndValidateDefinition(duplicateExports), /Duplicate export name: shared/u);
  assert.throws(() => parseAndValidateDefinition(cycle), /WORKFLOW_CYCLE/u);
});
