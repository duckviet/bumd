export type UnknownRecord = {
  readonly [key: string]: unknown;
};

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRecord(value: unknown, key: string): UnknownRecord | null {
  const child = isRecord(value) ? value[key] : undefined;
  return isRecord(child) ? child : null;
}

export function readString(value: unknown, key: string): string | null {
  const child = isRecord(value) ? value[key] : undefined;
  return typeof child === "string" ? child : null;
}
