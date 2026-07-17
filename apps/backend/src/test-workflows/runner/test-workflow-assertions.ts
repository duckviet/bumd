import type { TestWorkflowAssertion } from "../test-workflow-types.js";

export type AssertionResult = {
  readonly id: string;
  readonly type: string;
  readonly passed: boolean;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly error?: string | undefined;
};

export type ResolvedResponse = {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly durationMs: number;
};

export function evaluateAssertions(
  assertions: readonly TestWorkflowAssertion[],
  response: ResolvedResponse,
): AssertionResult[] {
  return assertions.map((assertion) => evaluateAssertion(assertion, response));
}

function evaluateAssertion(assertion: TestWorkflowAssertion, response: ResolvedResponse): AssertionResult {
  switch (assertion.type) {
    case "status":
      return evaluateStatus(assertion, response.status);
    case "jsonPath":
      return evaluateJsonPath(assertion, response.body);
    case "header":
      return evaluateHeader(assertion, response.headers);
    case "responseTime":
      return evaluateResponseTime(assertion, response.durationMs);
    default: {
      const _exhaustive: never = assertion;
      throw new Error(`Unknown assertion type: ${String((_exhaustive as { type: unknown }).type)}`);
    }
  }
}

function evaluateStatus(
  assertion: Extract<TestWorkflowAssertion, { type: "status" }>,
  actual: number,
): AssertionResult {
  let passed = false;
  switch (assertion.operator) {
    case "equals":
      passed = actual === assertion.expected;
      break;
    case "notEquals":
      passed = actual !== assertion.expected;
      break;
    case "in":
      passed = Array.isArray(assertion.expected) && assertion.expected.includes(actual);
      break;
  }
  return { id: assertion.id, type: assertion.type, passed, expected: assertion.expected, actual };
}

function evaluateJsonPath(
  assertion: Extract<TestWorkflowAssertion, { type: "jsonPath" }>,
  body: unknown,
): AssertionResult {
  let actual: unknown;
  let resolveError: string | undefined;
  try {
    actual = resolvePath(assertion.path, body);
  } catch (err) {
    resolveError = err instanceof Error ? err.message : "Path resolution failed";
  }

  let passed = false;
  switch (assertion.operator) {
    case "exists":
      passed = resolveError === undefined && actual !== undefined;
      break;
    case "equals":
      passed = resolveError === undefined && deepEqual(actual, assertion.expected);
      break;
    case "notEquals":
      passed = resolveError === undefined && !deepEqual(actual, assertion.expected);
      break;
    case "contains":
      passed =
        resolveError === undefined &&
        typeof actual === "string" &&
        typeof assertion.expected === "string" &&
        actual.includes(assertion.expected);
      break;
  }

  const result: AssertionResult = resolveError !== undefined
    ? { id: assertion.id, type: assertion.type, passed, expected: assertion.expected, actual: undefined, error: resolveError }
    : { id: assertion.id, type: assertion.type, passed, expected: assertion.expected, actual };
  return result;
}

function evaluateHeader(
  assertion: Extract<TestWorkflowAssertion, { type: "header" }>,
  headers: Record<string, string>,
): AssertionResult {
  const normalizedName = assertion.name.toLowerCase();
  const actual = Object.entries(headers).find(([k]) => k.toLowerCase() === normalizedName)?.[1];

  let passed = false;
  switch (assertion.operator) {
    case "exists":
      passed = actual !== undefined;
      break;
    case "equals":
      passed = actual !== undefined && actual === assertion.expected;
      break;
    case "contains":
      passed =
        actual !== undefined &&
        typeof assertion.expected === "string" &&
        actual.includes(assertion.expected);
      break;
  }

  return { id: assertion.id, type: assertion.type, passed, expected: assertion.expected, actual };
}

function evaluateResponseTime(
  assertion: Extract<TestWorkflowAssertion, { type: "responseTime" }>,
  durationMs: number,
): AssertionResult {
  const passed = durationMs < assertion.expectedMs;
  return {
    id: assertion.id,
    type: assertion.type,
    passed,
    expected: assertion.expectedMs,
    actual: durationMs,
  };
}

/**
 * Resolves a JSON path string like $.data.items[0].id against a value.
 */
export function resolvePath(path: string, value: unknown): unknown {
  if (!path.startsWith("$.")) {
    throw new Error(`Invalid path: ${path}`);
  }
  const parts = tokenizePath(path.slice(2));
  let current: unknown = value;
  for (const part of parts) {
    if (!isRecord(current) && !Array.isArray(current)) {
      throw new Error(`Path "${path}" could not be resolved: value at segment is not an object or array`);
    }
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) {
        throw new Error(`Path "${path}" uses non-integer index "${part}"`);
      }
      current = current[index];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
    if (current === undefined) {
      throw new Error(`Path "${path}" could not be resolved: "${part}" is undefined`);
    }
  }
  return current;
}

function tokenizePath(path: string): string[] {
  // Split on "." and "[N]"
  return path
    .replace(/\[(\d+)\]/gu, ".$1")
    .split(".")
    .filter(Boolean);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
