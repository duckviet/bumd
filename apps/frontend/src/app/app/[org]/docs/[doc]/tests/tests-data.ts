import { notFound } from "next/navigation";

import type { TestWorkflowDto } from "@/entities/test-workflow";
import { fetchLatestReadyVersion } from "@/shared/api/portal-client";
import { dashboardTestsContext } from "@/shared/api/dashboard-management-client";
import type { PaletteOperation } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";

type TestsPageData = {
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly branchSlug: string;
  readonly workflows: readonly TestWorkflowDto[];
  readonly operations: readonly PaletteOperation[];
  readonly defaultServerUrl?: string | undefined;
};

type OpenApiOperation = {
  readonly operationId?: unknown;
  readonly tags?: unknown;
  readonly summary?: unknown;
  readonly description?: unknown;
};

export async function loadTestsPageData(orgSlug: string, docSlug: string): Promise<TestsPageData> {
  const context = await dashboardTestsContext(orgSlug, docSlug);
  if (context === null) {
    notFound();
  }
  const latest = context.branchSlug !== ""
    ? await fetchLatestReadyVersion({ orgSlug, docSlug, branchSlug: context.branchSlug })
    : null;

  return {
    organizationId: context.organizationId,
    docId: context.docId,
    branchId: context.branchId,
    branchSlug: context.branchSlug,
    workflows: context.workflows.map((workflow) => ({ ...workflow, definitionJson: workflow.definitionJson as TestWorkflowDto["definitionJson"] })),
    operations: latest ? extractOperations(latest.spec) : [],
    defaultServerUrl: latest ? extractDefaultServerUrl(latest.spec) : undefined,
  };
}

function extractDefaultServerUrl(spec: unknown): string | undefined {
  if (!isRecord(spec)) return undefined;

  // Try servers array (OpenAPI 3.x)
  if (Array.isArray(spec["servers"]) && spec["servers"].length > 0) {
    const first = spec["servers"][0];
    if (isRecord(first) && typeof first["url"] === "string") {
      return first["url"];
    }
  }

  // Legacy OpenAPI/Swagger 2.0 host and basePath
  const host = stringValue(spec["host"]);
  if (host) {
    const schemes = Array.isArray(spec["schemes"]) && typeof spec["schemes"][0] === "string"
      ? spec["schemes"][0]
      : "http";
    const basePath = stringValue(spec["basePath"]) ?? "";
    return `${schemes}://${host}${basePath}`;
  }

  return undefined;
}

function extractOperations(spec: unknown): PaletteOperation[] {
  if (!isRecord(spec) || !isRecord(spec["paths"])) {
    return [];
  }
  const paths = spec["paths"];

  const operations: PaletteOperation[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      continue;
    }
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const operation = asOperation(pathItem[method]);
      const operationId = stringValue(operation?.operationId);
      if (!operationId) {
        continue;
      }
      operations.push({
        method: method.toUpperCase(),
        path,
        operationId,
        tags: stringArrayValue(operation?.tags),
        summary: stringValue(operation?.summary) ?? stringValue(operation?.description) ?? operationId,
        description: stringValue(operation?.description) ?? "",
      });
    }
  }
  return operations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOperation(value: unknown): OpenApiOperation | null {
  return isRecord(value) ? value : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
