import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import type { TestWorkflowDto } from "@/entities/test-workflow";
import { fetchLatestReadyVersion } from "@/shared/api/portal-client";
import {
  DashboardManagementError,
  dashboardTestsContext,
} from "@/shared/api/dashboard-management-client";
import { listTestEnvironmentsServer } from "@/shared/api/test-workflows-server";
import type { TestEnvironmentDto } from "@/shared/api/test-workflow-types";
import type { PaletteOperation } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";

type TestsPageData = {
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly branchSlug: string;
  readonly workflows: readonly TestWorkflowDto[];
  readonly operations: readonly PaletteOperation[];
  readonly defaultServerUrl?: string | undefined;
  readonly environments: readonly TestEnvironmentDto[];
};

type OpenApiOperation = {
  readonly operationId?: unknown;
  readonly tags?: unknown;
  readonly summary?: unknown;
  readonly description?: unknown;
};

export const loadTestsPageData = cache(async function loadTestsPageData(
  orgSlug: string,
  docSlug: string,
): Promise<TestsPageData> {
  const context = await dashboardTestsContext(orgSlug, docSlug);
  if (context === null) {
    notFound();
  }

  const specPromise = context.branchSlug !== "" ? fetchLatestReadyVersion({ orgSlug, docSlug, branchSlug: context.branchSlug }) : Promise.resolve(null);
  const environmentsPromise = context.branchSlug !== "" ? listTestEnvironmentsServer({ orgSlug, docSlug, branchSlug: context.branchSlug }) : Promise.resolve([]);

  const [latest, environments] = await Promise.all([
    tryCatchNull(specPromise),
    tryCatchEnvironments(environmentsPromise),
  ]);

  return {
    organizationId: context.organizationId,
    docId: context.docId,
    branchId: context.branchId,
    branchSlug: context.branchSlug,
    workflows: context.workflows.map((workflow) => ({ ...workflow, definitionJson: workflow.definitionJson as TestWorkflowDto["definitionJson"] })),
    operations: latest ? extractOperations(latest.spec) : [],
    defaultServerUrl: latest ? extractDefaultServerUrl(latest.spec) : undefined,
    environments,
  };
});

export function handleTestsDataError(error: unknown, callbackPath: string): never {
  if (error instanceof DashboardManagementError && error.statusCode === 401) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  if (error instanceof DashboardManagementError && error.statusCode === 403) {
    notFound();
  }

  throw error;
}

async function tryCatchNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

async function tryCatchEnvironments(promise: Promise<TestEnvironmentDto[]>): Promise<TestEnvironmentDto[]> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof DashboardManagementError && (error.statusCode === 401 || error.statusCode === 403)) {
      throw error;
    }
    return [];
  }
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
