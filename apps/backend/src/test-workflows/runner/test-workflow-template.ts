/**
 * Template interpolation engine.
 *
 * Rules (spec §7.4):
 * - Pure template: value === "{{vars.X}}" or "{{env.X}}" exactly → preserve resolved type.
 * - Embedded template: template expression inside surrounding text → coerce to string;
 *   object/array values are forbidden in embedded context → throws VAR_REF_INVALID.
 * - Object/array values: recursively interpolate.
 */

const PURE_TEMPLATE_RE = /^\{\{\s*(vars|env)\.(\w+)\s*\}\}$/u;
const ANY_TEMPLATE_RE = /\{\{\s*(vars|env)\.(\w+)\s*\}\}/gu;

export type InterpolationContext = {
  readonly vars: Record<string, unknown>;
  readonly env: Record<string, string>;
  /** Keys of secret env vars so they can be tracked for redaction */
  readonly secretKeys: ReadonlySet<string>;
};

/** Refs collected during interpolation (for inputsJson recording) */
export type CollectedRef =
  | { readonly kind: "env"; readonly key: string; readonly isSecret: boolean }
  | { readonly kind: "var"; readonly name: string; readonly value: unknown };

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
    const namespace = pureMatch[1] as "vars" | "env";
    const key = pureMatch[2]!;
    return resolvePure(namespace, key, ctx, refs);
  }

  // Embedded: replace all occurrences inside the string
  const allMatches = [...value.matchAll(ANY_TEMPLATE_RE)];
  if (allMatches.length === 0) return value;

  let result = value;
  for (const match of allMatches) {
    const namespace = match[1] as "vars" | "env";
    const key = match[2]!;
    const resolved = resolveRef(namespace, key, ctx, refs);

    if (resolved !== null && typeof resolved === "object") {
      throw new Error(`VAR_REF_INVALID: Cannot embed object/array value inside a string template ("${match[0]}")`);
    }

    const strValue = resolved === null || resolved === undefined ? "" : String(resolved);
    result = result.replace(match[0], strValue);
  }
  return result;
}

function resolvePure(
  namespace: "vars" | "env",
  key: string,
  ctx: InterpolationContext,
  refs: CollectedRef[],
): unknown {
  const resolved = resolveRef(namespace, key, ctx, refs);
  return resolved;
}

function resolveRef(
  namespace: "vars" | "env",
  key: string,
  ctx: InterpolationContext,
  refs: CollectedRef[],
): unknown {
  if (namespace === "env") {
    const value = ctx.env[key];
    if (value === undefined) {
      throw new Error(`ENV_VAR_MISSING: Environment variable "{{env.${key}}}" is not defined`);
    }
    refs.push({ kind: "env", key, isSecret: ctx.secretKeys.has(key) });
    return value;
  }

  // vars
  if (!(key in ctx.vars)) {
    throw new Error(`VAR_REF_INVALID: Variable "{{vars.${key}}}" is not available at this step`);
  }
  const value = ctx.vars[key];
  refs.push({ kind: "var", name: key, value });
  return value;
}

/**
 * Statically collect all template refs from a value tree without resolving.
 */
export function collectTemplateRefs(value: unknown): { envRefs: string[]; varRefs: string[] } {
  const envRefs: string[] = [];
  const varRefs: string[] = [];
  collectRefsFromValue(value, envRefs, varRefs);
  return { envRefs, varRefs };
}

function collectRefsFromValue(value: unknown, envRefs: string[], varRefs: string[]): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(ANY_TEMPLATE_RE)) {
      const namespace = match[1] as "vars" | "env";
      const key = match[2]!;
      if (namespace === "env") {
        if (!envRefs.includes(key)) envRefs.push(key);
      } else {
        if (!varRefs.includes(key)) varRefs.push(key);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefsFromValue(item, envRefs, varRefs);
    return;
  }
  if (isRecord(value)) {
    for (const v of Object.values(value)) collectRefsFromValue(v, envRefs, varRefs);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
