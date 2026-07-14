/**
 * Template interpolation engine.
 *
 * Rules (spec §7.4):
 * - Pure template: value === "{{vars.X}}", "{{env.X}}", or "{{data.X}}" exactly → preserve resolved type.
 * - Embedded template: template expression inside surrounding text → coerce to string;
 *   object/array values are forbidden in embedded context → throws VAR_REF_INVALID.
 * - Object/array values: recursively interpolate.
 */

const PURE_TEMPLATE_RE = /^\{\{\s*(vars|env|data)\.(\w+)\s*\}\}$/u;
const ANY_TEMPLATE_RE = /\{\{\s*(vars|env|data)\.(\w+)\s*\}\}/gu;

type TemplateNamespace = "vars" | "env" | "data";

export type InterpolationContext = {
  readonly vars: Record<string, unknown>;
  readonly env: Record<string, string>;
  readonly data: Readonly<Record<string, JsonValue>>;
  /** Keys of secret env vars so they can be tracked for redaction */
  readonly secretKeys: ReadonlySet<string>;
};

/** Refs collected during interpolation (for inputsJson recording) */
export type CollectedRef =
  | { readonly kind: "env"; readonly key: string; readonly isSecret: boolean }
  | { readonly kind: "data"; readonly key: string; readonly value: JsonValue }
  | { readonly kind: "var"; readonly name: string; readonly value: unknown };

export type CollectedInput =
  | { readonly type: "env"; readonly key: string; readonly value: string | undefined }
  | { readonly type: "data"; readonly key: string; readonly value: JsonValue }
  | { readonly type: "var"; readonly name: string; readonly value: unknown };

export function collectedRefsToInputs(
  refs: readonly CollectedRef[],
  envValues: Readonly<Record<string, string>>,
): readonly CollectedInput[] {
  return refs.map((ref): CollectedInput => {
    if (ref.kind === "env") {
      return {
        type: "env",
        key: ref.key,
        value: ref.isSecret ? "[REDACTED]" : envValues[ref.key],
      };
    }
    if (ref.kind === "data") {
      return { type: "data", key: ref.key, value: ref.value };
    }
    return { type: "var", name: ref.name, value: ref.value };
  });
}

/**
 * Interpolates template expressions in a value tree.
 * Returns the interpolated value and a list of all refs encountered.
 */
export function interpolate(
  value: unknown,
  ctx: InterpolationContext,
  refs: CollectedRef[] = [],
): unknown {
  if (typeof value === "string") {
    return interpolateString(value, ctx, refs);
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolate(item, ctx, refs));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolate(v, ctx, refs);
    }
    return result;
  }
  // number, boolean, null — return as-is
  return value;
}

function interpolateString(
  value: string,
  ctx: InterpolationContext,
  refs: CollectedRef[],
): unknown {
  // Check pure template first
  const pureMatch = PURE_TEMPLATE_RE.exec(value);
  if (pureMatch !== null) {
    const namespace = pureMatch[1];
    const key = pureMatch[2];
    if (isTemplateNamespace(namespace) && key !== undefined) {
      return resolveRef(namespace, key, ctx, refs);
    }
  }

  // Embedded: replace all occurrences inside the string
  const allMatches = [...value.matchAll(ANY_TEMPLATE_RE)];
  if (allMatches.length === 0) return value;

  let result = value;
  for (const match of allMatches) {
    const namespace = match[1];
    const key = match[2];
    if (!isTemplateNamespace(namespace) || key === undefined) continue;
    const resolved = resolveRef(namespace, key, ctx, refs);

    if (resolved !== null && typeof resolved === "object") {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.VarRefInvalid,
        422,
        `Cannot embed object/array value inside a string template ("${match[0]}")`,
      );
    }

    const strValue = resolved === null || resolved === undefined ? "" : String(resolved);
    result = result.replace(match[0], strValue);
  }
  return result;
}

function resolveRef(
  namespace: TemplateNamespace,
  key: string,
  ctx: InterpolationContext,
  refs: CollectedRef[],
): unknown {
  if (namespace === "env") {
    const value = ctx.env[key];
    if (value === undefined) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.EnvVarMissing,
        422,
        `Environment variable "{{env.${key}}}" is not defined`,
      );
    }
    refs.push({ kind: "env", key, isSecret: ctx.secretKeys.has(key) });
    return value;
  }

  if (namespace === "data") {
    const value = ctx.data[key];
    if (value === undefined) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.TestDataMissing,
        422,
        `Test data "{{data.${key}}}" is not defined in the workflow context`,
      );
    }
    refs.push({ kind: "data", key, value });
    return value;
  }

  if (!(key in ctx.vars)) {
    throw new TestWorkflowError(
      TestWorkflowErrorCode.VarRefInvalid,
      422,
      `Variable "{{vars.${key}}}" is not available at this step`,
    );
  }
  const value = ctx.vars[key];
  refs.push({ kind: "var", name: key, value });
  return value;
}

/**
 * Statically collect all template refs from a value tree without resolving.
 */
export function collectTemplateRefs(value: unknown): {
  readonly dataRefs: string[];
  readonly envRefs: string[];
  readonly varRefs: string[];
} {
  const refs = { dataRefs: [], envRefs: [], varRefs: [] } satisfies TemplateRefs;
  collectRefsFromValue(value, refs);
  return refs;
}

type TemplateRefs = {
  readonly dataRefs: string[];
  readonly envRefs: string[];
  readonly varRefs: string[];
};

function collectRefsFromValue(value: unknown, refs: TemplateRefs): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(ANY_TEMPLATE_RE)) {
      const namespace = match[1];
      const key = match[2];
      if (!isTemplateNamespace(namespace) || key === undefined) continue;
      if (namespace === "env") {
        if (!refs.envRefs.includes(key)) refs.envRefs.push(key);
      } else if (namespace === "data") {
        if (!refs.dataRefs.includes(key)) refs.dataRefs.push(key);
      } else if (!refs.varRefs.includes(key)) {
        refs.varRefs.push(key);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefsFromValue(item, refs);
    return;
  }
  if (isRecord(value)) {
    for (const v of Object.values(value)) collectRefsFromValue(v, refs);
  }
}

function isTemplateNamespace(value: string | undefined): value is TemplateNamespace {
  return value === "vars" || value === "env" || value === "data";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import { TestWorkflowError } from "../test-workflow-errors.js";
import type { JsonValue } from "../test-workflow-types.js";
import { TestWorkflowErrorCode } from "../test-workflow-types.js";
