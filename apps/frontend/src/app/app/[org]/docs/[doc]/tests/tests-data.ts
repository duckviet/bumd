import { notFound } from "next/navigation";

import type { TestWorkflowDto } from "@/entities/test-workflow";
import { fetchLatestReadyVersion } from "@/shared/api/portal-client";
import { getDb } from "@/shared/db";
import type { PaletteOperation } from "@/widgets/test-workflow-canvas/ui/endpoint-palette";

type WorkflowRow = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly definitionJson: unknown;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type TestsPageData = {
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly branchSlug: string;
  readonly workflows: readonly TestWorkflowDto[];
  readonly operations: readonly PaletteOperation[];
};

type OpenApiOperation = {
  readonly operationId?: unknown;
  readonly tags?: unknown;
  readonly summary?: unknown;
  readonly description?: unknown;
};

export async function loadTestsPageData(orgSlug: string, docSlug: string): Promise<TestsPageData> {
  const db = getDb();
  const docResult = await db.query<{
    readonly docId: string;
    readonly organizationId: string;
    readonly branchId: string | null;
    readonly branchSlug: string | null;
  }>(
    `SELECT d.id AS "docId", d."organizationId", b.id AS "branchId", b.slug AS "branchSlug"
     FROM "Doc" d
     INNER JOIN "Organization" o ON o.id = d."organizationId"
     LEFT JOIN "Branch" b ON b.id = d."defaultBranchId"
     WHERE o.slug = $1 AND d.slug = $2`,
    [orgSlug, docSlug],
  );

  const doc = docResult.rows[0];
  if (!doc) {
    notFound();
  }

  const branch = await resolveBranch(db, doc.docId, doc.branchId, doc.branchSlug);
  if (!branch) {
    notFound();
  }

  const workflowsResult = await db.query<WorkflowRow>(
    `SELECT id, name, slug, description, "definitionJson", revision, "createdAt", "updatedAt"
     FROM "TestWorkflow"
     WHERE "organizationId" = $1 AND "docId" = $2 AND "branchId" = $3 AND "deletedAt" IS NULL
     ORDER BY "createdAt" DESC
     LIMIT 100`,
    [doc.organizationId, doc.docId, branch.id],
  );

  const latest = await fetchLatestReadyVersion({ orgSlug, docSlug, branchSlug: branch.slug });

  return {
    organizationId: doc.organizationId,
    docId: doc.docId,
    branchId: branch.id,
    branchSlug: branch.slug,
    workflows: workflowsResult.rows.map(mapWorkflow),
    operations: latest ? extractOperations(latest.spec) : [],
  };
}

async function resolveBranch(
  db: ReturnType<typeof getDb>,
  docId: string,
  branchId: string | null,
  branchSlug: string | null,
): Promise<{ readonly id: string; readonly slug: string } | null> {
  if (branchId && branchSlug) {
    return { id: branchId, slug: branchSlug };
  }

  const branchResult = await db.query<{ readonly id: string; readonly slug: string }>(
    `SELECT id, slug FROM "Branch" WHERE "docId" = $1 ORDER BY "createdAt" ASC LIMIT 1`,
    [docId],
  );
  return branchResult.rows[0] ?? null;
}

function mapWorkflow(row: WorkflowRow): TestWorkflowDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    definitionJson: row.definitionJson as TestWorkflowDto["definitionJson"],
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
