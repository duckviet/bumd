import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";
import { z } from "zod";
import {
  EmptyWorkflowDefinition,
  newWorkflowId,
  type TestWorkflowRecord,
  type TestWorkflowMetadata,
} from "./test-workflow-types.js";
import { TestWorkflowErrorCode } from "./test-workflow-types.js";
import { TestWorkflowError } from "./test-workflow-errors.js";
import { parseAndValidateDefinition, WorkflowDefinitionSchema, WorkflowTagsSchema } from "./test-workflow-definition.schema.js";
import { CreateTestWorkflowDtoSchema, type CreateTestWorkflowDto } from "./dto/create-test-workflow.dto.js";
import { UpdateTestWorkflowDtoSchema, type UpdateTestWorkflowDto } from "./dto/update-test-workflow.dto.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

type MetadataWorkflowRecord = TestWorkflowRecord & TestWorkflowMetadata;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 200) || "workflow";
}

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

@Injectable()
export class TestWorkflowsService implements OnModuleDestroy {
  private pool: Pool | null = null;
  private readonly logger = new Logger(TestWorkflowsService.name);

  public async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private db(): Pool {
    if (!this.pool) {
      this.pool = new Pool({ connectionString: databaseUrl() });
    }
    return this.pool;
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  public async listWorkflows(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<{ items: TestWorkflowListItemDto[]; nextCursor: string | null }> {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const cursorDate = input.cursor ? decodeCursor(input.cursor) : null;

    const result = await this.db().query<MetadataWorkflowRecord>(
      `SELECT id, "organizationId", "docId", "branchId", name, slug, description,
              tags, priority, type, "definitionJson", revision, "createdByUserId", "updatedByUserId",
              "createdAt", "updatedAt", "deletedAt"
       FROM "TestWorkflow"
       WHERE "organizationId" = $1
         AND "docId" = $2
         AND "branchId" = $3
         AND "deletedAt" IS NULL
         ${cursorDate ? `AND "createdAt" < $4` : ""}
       ORDER BY "createdAt" DESC
       LIMIT ${limit + 1}`,
      cursorDate
        ? [input.organizationId, input.docId, input.branchId, cursorDate]
        : [input.organizationId, input.docId, input.branchId],
    );

    const rows = result.rows;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapWorkflowListItem);
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1]!.createdAt) : null;
    return { items, nextCursor };
  }

  // ─── Create ───────────────────────────────────────────────────────────────────

  public async createWorkflow(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly createdByUserId: string;
    readonly body: unknown;
  }): Promise<TestWorkflowDetailDto> {
    const parsed = CreateTestWorkflowDtoSchema.safeParse(input.body);
    if (!parsed.success) {
      throw new TestWorkflowError(TestWorkflowErrorCode.WorkflowInvalid, 400, "Invalid request body");
    }
    const dto = parsed.data;

    let slug = dto.slug ?? slugify(dto.name);
    const definitionJson = dto.definitionJson
      ? parseAndValidateDefinition(dto.definitionJson)
      : EmptyWorkflowDefinition;

    const id = newWorkflowId();
    const now = new Date();

    try {
      const result = await this.db().query<MetadataWorkflowRecord>(
        `INSERT INTO "TestWorkflow"
           (id, "organizationId", "docId", "branchId", name, slug, description,
            tags, priority, type, "definitionJson", revision, "createdByUserId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, $13, $13)
         RETURNING *`,
        [
          id,
          input.organizationId,
          input.docId,
          input.branchId,
          dto.name,
          slug,
          dto.description ?? null,
          WorkflowTagsSchema.parse(dto.tags),
          dto.priority,
          dto.type,
          JSON.stringify(definitionJson),
          input.createdByUserId,
          now,
        ],
      );
      return mapWorkflowDetail(result.rows[0]!);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.WorkflowSlugConflict,
          409,
          `Slug "${slug}" is already in use for this doc and branch.`,
        );
      }
      throw err;
    }
  }

  // ─── Get ──────────────────────────────────────────────────────────────────────

  public async getWorkflow(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly workflowId: string;
  }): Promise<TestWorkflowDetailDto> {
    const row = await this.requireWorkflow(input);
    return mapWorkflowDetail(row);
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  public async updateWorkflow(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly workflowId: string;
    readonly updatedByUserId: string;
    readonly body: unknown;
  }): Promise<TestWorkflowDetailDto> {
    const parsed = UpdateTestWorkflowDtoSchema.safeParse(input.body);
    if (!parsed.success) {
      throw new TestWorkflowError(TestWorkflowErrorCode.WorkflowInvalid, 400, "Invalid request body");
    }
    const dto = parsed.data;

    const existing = await this.requireWorkflow(input);

    if (existing.revision !== dto.expectedRevision) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.WorkflowConflict,
        409,
        "This workflow was updated in another tab. Reload before saving.",
        { currentRevision: existing.revision },
      );
    }

    // Validate definition if provided
    let normalizedDefinition: ReturnType<typeof parseAndValidateDefinition> | undefined;
    if (dto.definitionJson !== undefined) {
      try {
        normalizedDefinition = parseAndValidateDefinition(dto.definitionJson);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid definition";
        const code = msg === "WORKFLOW_CYCLE"
          ? TestWorkflowErrorCode.WorkflowCycle
          : TestWorkflowErrorCode.WorkflowInvalid;
        throw new TestWorkflowError(code, 400, msg);
      }
    }

    const setClauses: string[] = [`revision = revision + 1`, `"updatedAt" = NOW()`, `"updatedByUserId" = $2`];
    const values: unknown[] = [
      input.workflowId,
      input.updatedByUserId,
      input.organizationId,
      input.docId,
      input.branchId,
      dto.expectedRevision,
    ];
    let paramIndex = 7;

    if (dto.name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      values.push(dto.name);
      paramIndex++;
    }
    if (dto.slug !== undefined) {
      setClauses.push(`slug = $${paramIndex}`);
      values.push(dto.slug);
      paramIndex++;
    }
    if (dto.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      values.push(dto.description);
      paramIndex++;
    }
    if (dto.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex}`);
      values.push(WorkflowTagsSchema.parse(dto.tags));
      paramIndex++;
    }
    if (dto.priority !== undefined) {
      setClauses.push(`priority = $${paramIndex}`);
      values.push(dto.priority);
      paramIndex++;
    }
    if (dto.type !== undefined) {
      setClauses.push(`type = $${paramIndex}`);
      values.push(dto.type);
      paramIndex++;
    }
    if (normalizedDefinition !== undefined) {
      setClauses.push(`"definitionJson" = $${paramIndex}`);
      values.push(JSON.stringify(normalizedDefinition));
      paramIndex++;
    }

    try {
      const result = await this.db().query<MetadataWorkflowRecord>(
        `UPDATE "TestWorkflow"
         SET ${setClauses.join(", ")}
         WHERE id = $1 AND "organizationId" = $3 AND "docId" = $4 AND "branchId" = $5
           AND revision = $6 AND "deletedAt" IS NULL
         RETURNING *`,
        values,
      );
      if (result.rows.length === 0) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.WorkflowConflict,
          409,
          "This workflow was updated in another tab. Reload before saving.",
        );
      }
      return mapWorkflowDetail(result.rows[0]!);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.WorkflowSlugConflict,
          409,
          "Slug is already in use for this doc and branch.",
        );
      }
      throw err;
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  public async deleteWorkflow(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly workflowId: string;
  }): Promise<void> {
    await this.requireWorkflow(input);
    await this.db().query(
      `UPDATE "TestWorkflow" SET "deletedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $1 AND "organizationId" = $2 AND "docId" = $3 AND "branchId" = $4
         AND "deletedAt" IS NULL`,
      [input.workflowId, input.organizationId, input.docId, input.branchId],
    );
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  public async requireWorkflow(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly workflowId: string;
  }): Promise<MetadataWorkflowRecord> {
    const result = await this.db().query<MetadataWorkflowRecord>(
      `SELECT id, "organizationId", "docId", "branchId", name, slug, description,
              tags, priority, type, "definitionJson", revision, "createdByUserId", "updatedByUserId",
              "createdAt", "updatedAt", "deletedAt"
       FROM "TestWorkflow"
       WHERE id = $1 AND "organizationId" = $2 AND "docId" = $3 AND "branchId" = $4
         AND "deletedAt" IS NULL
       LIMIT 1`,
      [input.workflowId, input.organizationId, input.docId, input.branchId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new TestWorkflowError(TestWorkflowErrorCode.WorkflowInvalid, 404, "Workflow not found");
    }
    return row;
  }
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export type TestWorkflowListItemDto = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly tags: readonly string[];
  readonly priority: TestWorkflowMetadata["priority"];
  readonly type: TestWorkflowMetadata["type"];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TestWorkflowDetailDto = TestWorkflowListItemDto & {
  readonly definitionJson: unknown;
};

function mapWorkflowListItem(row: MetadataWorkflowRecord): TestWorkflowListItemDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    tags: row.tags,
    priority: row.priority,
    type: row.type,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapWorkflowDetail(row: MetadataWorkflowRecord): TestWorkflowDetailDto {
  return {
    ...mapWorkflowListItem(row),
    definitionJson: row.definitionJson,
  };
}

function encodeCursor(isoDate: string): string {
  return Buffer.from(isoDate).toString("base64url");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf8");
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}
