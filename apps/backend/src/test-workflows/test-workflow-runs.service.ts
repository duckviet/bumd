import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";
import { parse as parseYaml } from "yaml";
import { DEPLOY_STORE, type DeployStore } from "../versions/deploy-ports.js";
import { TestWorkflowError } from "./test-workflow-errors.js";
import {
  TestWorkflowErrorCode,
  TerminalRunStatuses,
  newRunId,
} from "./test-workflow-types.js";
import { TestWorkflowsService } from "./test-workflows.service.js";
import { TestEnvironmentsService } from "./test-environments.service.js";
import { validateDefinitionForRun } from "./runner/test-workflow-validator.js";
import { CreateTestWorkflowRunDtoSchema } from "./dto/create-test-workflow-run.dto.js";
import { parseAndValidateDefinition } from "./test-workflow-definition.schema.js";
import {
  workflowMetadataSnapshot,
  type EncryptedEnvironmentSnapshot,
} from "./test-workflow-snapshots.js";
import { TestWorkflowRunDispatcher } from "./test-workflow-run-dispatcher.js";
import {
  mapRunDetail,
  mapRunListItem,
  type TestWorkflowRunDetailDto,
  type TestWorkflowRunListItemDto,
} from "./test-workflow-run-dto.js";
import {
  findLatestReadyVersion,
  findRun,
  findRuns,
  findRunSteps,
  persistRun,
  requestRunCancel,
} from "./test-workflow-run-repository.js";

export type {
  TestWorkflowRunDetailDto,
  TestWorkflowRunListItemDto,
  TestWorkflowStepRunDto,
} from "./test-workflow-run-dto.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

@Injectable()
export class TestWorkflowRunsService implements OnModuleDestroy {
  private pool: Pool | null = null;
  private readonly dispatcher = new TestWorkflowRunDispatcher(process.env["REDIS_URL"]);

  // In-memory rate limit: userId+workflowId -> timestamps[]
  private readonly rateLimitMap = new Map<string, number[]>();
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private readonly RATE_LIMIT_MAX = 10;

  public constructor(
    @Inject(DEPLOY_STORE) private readonly deployStore: DeployStore,
    private readonly workflowsService: TestWorkflowsService,
    private readonly envService: TestEnvironmentsService,
  ) {}

  public async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    await this.dispatcher.close();
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
      docId: input.docId,
      branchId: input.branchId,
      workflowId: input.workflowId,
    });

    // Resolve latest-ready version
    const latestReady = await findLatestReadyVersion({
      pool: this.db(),
      organizationId: input.organizationId,
      docId: input.docId,
      branchId: input.branchId,
    });
    if (latestReady === null) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.NoReadyVersion,
        422,
        "No ready API document version found for this branch.",
      );
    }
    const rawSpec = await this.deployStore.getRawSpec(latestReady.id);
    const parsedSpec = parseSpec(rawSpec);

    // Validate environment
    let environmentSnapshot: EncryptedEnvironmentSnapshot | null = null;
    if (dto.environmentId !== undefined) {
      try {
        environmentSnapshot = await this.envService.loadEncryptedEnvironmentSnapshot({
          organizationId: input.organizationId,
          docId: input.docId,
          branchId: input.branchId,
          environmentId: dto.environmentId,
        });
      } catch (error: unknown) {
        if (error instanceof TestWorkflowError && error.code === TestWorkflowErrorCode.EnvNotFound) {
          throw new TestWorkflowError(TestWorkflowErrorCode.EnvNotFound, 422, "Environment not found or has been deleted");
        }
        throw error;
      }
    }

    // Load env var keys for run-time validation
    const envVarKeys: Set<string> = new Set();
    if (environmentSnapshot !== null) {
      for (const variable of environmentSnapshot.variables) {
        if (variable.encryptedValue !== null) envVarKeys.add(variable.key);
      }
    }

    // Run-time definition validation
    const definition = parseAndValidateDefinition(workflow.definitionJson);
    validateDefinitionForRun(definition, parsedSpec, envVarKeys);

    // Create run and steps in a transaction
    const runId = newRunId();
    await persistRun(this.db(), {
      scope: {
        organizationId: input.organizationId,
        docId: input.docId,
        branchId: input.branchId,
        workflowId: input.workflowId,
      },
      runId,
      versionId: latestReady.id,
      environmentId: dto.environmentId ?? null,
      startedByUserId: input.startedByUserId,
      startedByTokenId: input.startedByTokenId,
      definition,
      metadata: workflowMetadataSnapshot(workflow),
      environmentSnapshot,
    });

    // Enqueue job
    await this.dispatcher.enqueue({
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
    readonly docId: string;
    readonly branchId: string;
    readonly workflowId: string;
    readonly runId: string;
  }): Promise<TestWorkflowRunDetailDto> {
    const run = await this.requireRun(input);
    const steps = await findRunSteps(this.db(), input.runId);
    return mapRunDetail(run, steps);
  }

  // ─── List Runs ────────────────────────────────────────────────────────────────

  public async listRuns(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly workflowId: string;
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<{ items: TestWorkflowRunListItemDto[]; nextCursor: string | null }> {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const cursorDate = input.cursor ? decodeCursor(input.cursor) : null;

    const rows = await findRuns({
      pool: this.db(),
      scope: input,
      cursorDate,
      limit,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapRunListItem);
    const lastItem = items.at(-1);
    const nextCursor = hasMore && lastItem !== undefined ? encodeCursor(lastItem.createdAt) : null;
    return { items, nextCursor };
  }

  // ─── Cancel Run ───────────────────────────────────────────────────────────────

  public async cancelRun(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly workflowId: string;
    readonly runId: string;
  }): Promise<{ runId: string; status: "canceled" }> {
    const run = await this.requireRun(input);

    if (TerminalRunStatuses.has(run.status)) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.RunAlreadyTerminal,
        409,
        `Run is already in terminal state: ${run.status}`,
      );
    }

    await requestRunCancel(this.db(), input.runId);

    return { runId: input.runId, status: "canceled" };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  private async requireRun(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly workflowId: string;
    readonly runId: string;
  }) {
    const run = await findRun(this.db(), input);
    if (run === null) {
      throw new TestWorkflowError(TestWorkflowErrorCode.WorkflowInvalid, 404, "Run not found");
    }
    return run;
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
