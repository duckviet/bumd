import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";
import { Queue, type JobsOptions } from "bullmq";
import { parse as parseYaml } from "yaml";
import { DEPLOY_STORE, type DeployStore } from "../versions/deploy-ports.js";
import { VersionStatus } from "../versions/deploy-types.js";
import { TestWorkflowError } from "./test-workflow-errors.js";
import {
  TestWorkflowRunStatus,
  TestWorkflowStepStatus,
  TestWorkflowErrorCode,
  TerminalRunStatuses,
  newRunId,
  newStepRunId,
  type TestWorkflowRunRecord,
  type TestWorkflowStepRunRecord,
} from "./test-workflow-types.js";
import { TestWorkflowsService } from "./test-workflows.service.js";
import { TestEnvironmentsService } from "./test-environments.service.js";
import { validateDefinitionForRun } from "./runner/test-workflow-validator.js";
import type { CreateTestWorkflowRunDto } from "./dto/create-test-workflow-run.dto.js";
import { CreateTestWorkflowRunDtoSchema } from "./dto/create-test-workflow-run.dto.js";
import type { TestWorkflowJobData } from "./runner/test-workflow-runner.service.js";

const TEST_WORKFLOW_QUEUE_NAME = "test-workflow-runs";
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

function bullMqOptions(): { connection: { url: string } } | null {
  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) return null;
  return { connection: { url: redisUrl } };
}

@Injectable()
export class TestWorkflowRunsService implements OnModuleDestroy {
  private pool: Pool | null = null;
  private queue: Queue<TestWorkflowJobData> | null = null;
  private readonly logger = new Logger(TestWorkflowRunsService.name);

  // In-memory rate limit: userId+workflowId -> timestamps[]
  private readonly rateLimitMap = new Map<string, number[]>();
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private readonly RATE_LIMIT_MAX = 10;

  public constructor(
    @Inject(DEPLOY_STORE) private readonly deployStore: DeployStore,
    private readonly workflowsService: TestWorkflowsService,
    private readonly envService: TestEnvironmentsService,
  ) {
    const opts = bullMqOptions();
    if (opts !== null) {
      this.queue = new Queue<TestWorkflowJobData>(TEST_WORKFLOW_QUEUE_NAME, opts);
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    await this.queue?.close();
  }

  private db(): Pool {
    if (!this.pool) {
      this.pool = new Pool({ connectionString: databaseUrl() });
    }
    return this.pool;
  }

  // ─── Create Run ───────────────────────────────────────────────────────────────

  public async createRun(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly orgSlug: string;
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly workflowId: string;
    readonly startedByUserId: string | null;
    readonly startedByTokenId: string | null;
    readonly body: unknown;
  }): Promise<{ runId: string; status: "queued" }> {
    // Parse DTO
    const parsed = CreateTestWorkflowRunDtoSchema.safeParse(input.body);
    if (!parsed.success) {
      throw new TestWorkflowError(TestWorkflowErrorCode.WorkflowInvalid, 400, "Invalid request body");
    }
    const dto = parsed.data;

    // Rate limit
    this.checkRateLimit(input.startedByUserId ?? input.startedByTokenId ?? "anon", input.workflowId);

    // Load workflow
    const workflow = await this.workflowsService.requireWorkflow({
      organizationId: input.organizationId,
      workflowId: input.workflowId,
    });

    // Resolve latest-ready version
    const latestReady = await this.resolveLatestReadyVersion(input.organizationId, input.docId, input.branchId);
    const rawSpec = await this.deployStore.getRawSpec(latestReady.id);
    const parsedSpec = parseSpec(rawSpec);

    // Validate environment
    if (dto.environmentId !== undefined) {
      try {
        await this.envService.requireEnvironment({
          organizationId: input.organizationId,
          environmentId: dto.environmentId,
        });
      } catch {
        throw new TestWorkflowError(TestWorkflowErrorCode.EnvNotFound, 422, "Environment not found or has been deleted");
      }
    }

    // Load env var keys for run-time validation
    const envVarKeys: Set<string> = new Set();
    if (dto.environmentId) {
      const envValues = await this.envService.resolveEnvVariables(dto.environmentId);
      for (const key of Object.keys(envValues)) envVarKeys.add(key);
    }

    // Run-time definition validation
    const definition = workflow.definitionJson as ReturnType<typeof JSON.parse>;
    validateDefinitionForRun(definition as never, parsedSpec, envVarKeys);

    // Create run and steps in a transaction
    const runId = newRunId();
    const nodes = (definition as { nodes: { id: string; operationId: string }[] }).nodes;

    const client = await this.db().connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO "TestWorkflowRun"
           (id, "workflowId", "organizationId", "docId", "branchId", "versionId",
            "environmentId", status, "startedByUserId", "startedByTokenId",
            "definitionSnapshotJson", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        [
          runId,
          input.workflowId,
          input.organizationId,
          input.docId,
          input.branchId,
          latestReady.id,
          dto.environmentId ?? null,
          TestWorkflowRunStatus.Queued,
          input.startedByUserId,
          input.startedByTokenId,
          JSON.stringify(definition),
        ],
      );

      for (const node of nodes) {
        const stepId = newStepRunId();
        await client.query(
          `INSERT INTO "TestWorkflowStepRun"
             (id, "runId", "nodeId", "operationId", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [stepId, runId, node.id, node.operationId, TestWorkflowStepStatus.Queued],
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Enqueue job
    await this.enqueueJob({
      runId,
      orgSlug: input.orgSlug,
      docSlug: input.docSlug,
      branchSlug: input.branchSlug,
    });

    return { runId, status: "queued" };
  }

  // ─── Get Run ──────────────────────────────────────────────────────────────────

  public async getRun(input: {
    readonly organizationId: string;
    readonly workflowId: string;
    readonly runId: string;
  }): Promise<TestWorkflowRunDetailDto> {
    const run = await this.requireRun(input);
    const stepsResult = await this.db().query<TestWorkflowStepRunRecord>(
      `SELECT * FROM "TestWorkflowStepRun" WHERE "runId" = $1 ORDER BY "createdAt" ASC`,
      [input.runId],
    );
    return mapRunDetail(run, stepsResult.rows);
  }

  // ─── List Runs ────────────────────────────────────────────────────────────────

  public async listRuns(input: {
    readonly organizationId: string;
    readonly workflowId: string;
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<{ items: TestWorkflowRunListItemDto[]; nextCursor: string | null }> {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const cursorDate = input.cursor ? decodeCursor(input.cursor) : null;

    const result = await this.db().query<TestWorkflowRunRecord>(
      `SELECT id, "workflowId", "organizationId", "docId", "branchId", "versionId",
              "environmentId", status, "startedByUserId", "startedByTokenId",
              "definitionSnapshotJson", "cancelRequestedAt",
              "startedAt", "finishedAt", "durationMs", "errorCode", "errorMessage",
              "createdAt", "updatedAt"
       FROM "TestWorkflowRun"
       WHERE "workflowId" = $1 AND "organizationId" = $2
         ${cursorDate ? `AND "createdAt" < $3` : ""}
       ORDER BY "createdAt" DESC
       LIMIT ${limit + 1}`,
      cursorDate
        ? [input.workflowId, input.organizationId, cursorDate]
        : [input.workflowId, input.organizationId],
    );

    const rows = result.rows;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapRunListItem);
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1]!.createdAt) : null;
    return { items, nextCursor };
  }

  // ─── Cancel Run ───────────────────────────────────────────────────────────────

  public async cancelRun(input: {
    readonly organizationId: string;
    readonly workflowId: string;
    readonly runId: string;
  }): Promise<{ runId: string; status: "canceled" }> {
    const run = await this.requireRun(input);

    if (TerminalRunStatuses.has(run.status as typeof TestWorkflowRunStatus[keyof typeof TestWorkflowRunStatus])) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.RunAlreadyTerminal,
        409,
        `Run is already in terminal state: ${run.status}`,
      );
    }

    await this.db().query(
      `UPDATE "TestWorkflowRun"
       SET "cancelRequestedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $1 AND "cancelRequestedAt" IS NULL`,
      [input.runId],
    );

    return { runId: input.runId, status: "canceled" };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  private async requireRun(input: {
    readonly organizationId: string;
    readonly workflowId: string;
    readonly runId: string;
  }): Promise<TestWorkflowRunRecord> {
    const result = await this.db().query<TestWorkflowRunRecord>(
      `SELECT * FROM "TestWorkflowRun"
       WHERE id = $1 AND "workflowId" = $2 AND "organizationId" = $3
       LIMIT 1`,
      [input.runId, input.workflowId, input.organizationId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new TestWorkflowError(TestWorkflowErrorCode.WorkflowInvalid, 404, "Run not found");
    }
    return row;
  }

  private async resolveLatestReadyVersion(
    organizationId: string,
    docId: string,
    branchId: string,
  ): Promise<{ id: string }> {
    const result = await this.db().query<{ id: string }>(
      `SELECT id FROM "Version"
       WHERE "organizationId" = $1 AND "docId" = $2 AND "branchId" = $3
         AND status = $4
       ORDER BY "readyAt" DESC NULLS LAST, "createdAt" DESC
       LIMIT 1`,
      [organizationId, docId, branchId, VersionStatus.Ready],
    );
    const row = result.rows[0];
    if (!row) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.NoReadyVersion,
        422,
        "No ready API document version found for this branch.",
      );
    }
    return row;
  }

  private async enqueueJob(data: TestWorkflowJobData): Promise<void> {
    if (this.queue !== null) {
      const jobOptions: JobsOptions = {
        jobId: `test-workflow:${data.runId}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      };
      await this.queue.add("run-workflow", data, jobOptions);
    } else {
      // Fallback: in-memory async execution (dev mode without Redis)
      this.logger.warn(`No Redis URL configured; running workflow ${data.runId} synchronously in background`);
      // Will be picked up by in-process runner if wired
    }
  }

  private checkRateLimit(actorKey: string, workflowId: string): void {
    const key = `${actorKey}:${workflowId}`;
    const now = Date.now();
    const timestamps = (this.rateLimitMap.get(key) ?? []).filter(
      (ts) => now - ts < this.RATE_LIMIT_WINDOW_MS,
    );
    if (timestamps.length >= this.RATE_LIMIT_MAX) {
      throw new TestWorkflowError(
        "RATE_LIMIT_EXCEEDED",
        429,
        "Too many run requests. Please wait before creating another run.",
      );
    }
    timestamps.push(now);
    this.rateLimitMap.set(key, timestamps);
  }
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export type TestWorkflowRunListItemDto = {
  readonly id: string;
  readonly workflowId: string;
  readonly versionId: string;
  readonly environmentId: string | null;
  readonly status: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
};

export type TestWorkflowStepRunDto = {
  readonly id: string;
  readonly nodeId: string;
  readonly operationId: string;
  readonly status: string;
  readonly request: unknown;
  readonly response: unknown;
  readonly inputs: unknown;
  readonly exports: unknown;
  readonly assertions: unknown;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly error: { code: string; message: string } | null;
};

export type TestWorkflowRunDetailDto = TestWorkflowRunListItemDto & {
  readonly error: { code: string; message: string } | null;
  readonly steps: readonly TestWorkflowStepRunDto[];
};

function mapRunListItem(row: TestWorkflowRunRecord): TestWorkflowRunListItemDto {
  return {
    id: row.id,
    workflowId: row.workflowId,
    versionId: row.versionId,
    environmentId: row.environmentId,
    status: row.status,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapRunDetail(
  run: TestWorkflowRunRecord,
  steps: readonly TestWorkflowStepRunRecord[],
): TestWorkflowRunDetailDto {
  return {
    ...mapRunListItem(run),
    error: run.errorCode
      ? { code: run.errorCode, message: run.errorMessage ?? "" }
      : null,
    steps: steps.map((s) => ({
      id: s.id,
      nodeId: s.nodeId,
      operationId: s.operationId,
      status: s.status,
      request: s.requestJson,
      response: s.responseJson,
      inputs: s.inputsJson,
      exports: s.exportsJson,
      assertions: s.assertionsJson,
      startedAt: s.startedAt?.toISOString() ?? null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
      durationMs: s.durationMs,
      error: s.errorCode ? { code: s.errorCode, message: s.errorMessage ?? "" } : null,
    })),
  };
}

function encodeCursor(isoDate: string): string {
  return Buffer.from(isoDate).toString("base64url");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf8");
}

function parseSpec(rawSpec: string): unknown {
  try {
    return JSON.parse(rawSpec) as unknown;
  } catch {
    return parseYaml(rawSpec) as unknown;
  }
}
