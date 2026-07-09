export function resolvePath(template: string, pathParams: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    return pathParams[key] !== undefined && pathParams[key] !== ""
      ? encodeURIComponent(pathParams[key])
      : match;
  });
}

export function rowsToRecord(
  rows: readonly { readonly key: string; readonly value: string; readonly enabled?: boolean }[],
  options?: { readonly omitEmptyValue?: boolean; readonly omitEmptyKey?: boolean }
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    if (row.enabled === false) continue;
    const k = row.key.trim();
    const v = row.value;
    if (options?.omitEmptyKey && k.length === 0) continue;
    if (options?.omitEmptyValue && v.length === 0) continue;
    if (k.length > 0) {
      record[k] = v;
    }
  }
  return record;
}

export function prettyBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}
