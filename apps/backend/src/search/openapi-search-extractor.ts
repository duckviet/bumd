import type { VersionRecord } from "../versions/deploy-types.js";
import type { SearchDocument } from "./search-types.js";

const HttpMethods = ["get", "put", "post", "delete", "patch", "options", "head", "trace"] as const;

export function extractOpenApiSearchDocuments(version: VersionRecord, spec: unknown): readonly SearchDocument[] {
  if (!isRecord(spec) || !isRecord(spec["paths"])) {
    return [];
  }

  return Object.entries(spec["paths"]).flatMap(([path, pathItem]) => {
    if (!isRecord(pathItem)) {
      return [];
    }
    return HttpMethods.flatMap((method) => {
      const operation = pathItem[method];
      if (!isRecord(operation)) {
        return [];
      }
      const operationId = stringValue(operation["operationId"]) ?? fallbackOperationId(method, path);
      return [
        {
          organizationId: version.organizationId,
          docId: version.docId,
          branchId: version.branchId,
          versionId: version.id,
          operationId,
          method: method.toUpperCase(),
          path,
          tags: stringArray(operation["tags"]),
          summary: stringValue(operation["summary"]) ?? operationId,
          description: stringValue(operation["description"]) ?? "",
          anchor: `operation-${operationId}`,
        },
      ];
    });
  });
}

function fallbackOperationId(method: string, path: string): string {
  return `${method}-${path.replace(/[^a-z0-9]+/giu, "-")}`;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

