const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
]);

const REDACTED_PLACEHOLDER = "[REDACTED]";
const MAX_BODY_BYTES = 64 * 1024; // 64 KB

/**
 * Redacts sensitive headers in-place.
 */
export function redactSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED_PLACEHOLDER : value;
  }
  return result;
}

/**
 * Replaces all occurrences of secret values with [REDACTED] in any value tree.
 * Only replaces non-empty secret strings.
 */
export function redactSecretValues(
  value: unknown,
  secretValues: ReadonlySet<string>,
): unknown {
  if (secretValues.size === 0) return value;

  if (typeof value === "string") {
    let result = value;
    for (const secret of secretValues) {
      if (secret.length > 0 && result.includes(secret)) {
        result = result.replaceAll(secret, REDACTED_PLACEHOLDER);
      }
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretValues(item, secretValues));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = redactSecretValues(v, secretValues);
    }
    return result;
  }
  return value;
}

/**
 * Truncates a serialized body value if it exceeds 64 KB.
 * Returns the original value if under the limit, or a truncation envelope.
 */
export function truncateBody(body: unknown): unknown {
  if (body === undefined || body === null) return body;
  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength <= MAX_BODY_BYTES) return body;

  const preview = serialized.slice(0, 512);
  return {
    truncated: true,
    sizeBytes: byteLength,
    preview,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
