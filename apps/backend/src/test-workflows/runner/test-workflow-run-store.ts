import { Pool } from "pg";
import {
  TestWorkflowRunStatus,
  TestWorkflowStepStatus,
  type TestWorkflowNode,
  type TestWorkflowRunRecord,
  type TestWorkflowStepRunRecord,
} from "../test-workflow-types.js";
import type { StepExecutionResult } from "./test-workflow-step-executor.js";

export type SnapshotWorkflowRunRecord = TestWorkflowRunRecord & {
  readonly environmentSnapshotJson: unknown | null;
};

export class TestWorkflowRunStore {
  private readonly pool: Pool;

  public constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async loadRun(runId: string): Promise<SnapshotWorkflowRunRecord> {
    const result = await this.pool.query<SnapshotWorkflowRunRecord>(
      `SELECT * FROM "TestWorkflowRun" WHERE id = $1 LIMIT 1`,
      [runId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error(`Run ${runId} not found`);
    return row;
  }

  public async loadStep(runId: string, nodeId: string): Promise<TestWorkflowStepRunRecord> {
    const result = await this.pool.query<TestWorkflowStepRunRecord>(
      `SELECT * FROM "TestWorkflowStepRun" WHERE "runId" = $1 AND "nodeId" = $2 LIMIT 1`,
      [runId, nodeId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error(`Step ${nodeId} not found for run ${runId}`);
    return row;
  }

  public async markRunRunning(runId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "TestWorkflowRun"
       SET status = $1, "startedAt" = COALESCE("startedAt", NOW()), "updatedAt" = NOW()
       WHERE id = $2`,
      [TestWorkflowRunStatus.Running, runId],
    );
  }

  public async finalizeRun(runId: string, outcome: {
    readonly status: TestWorkflowRunStatus;
    readonly durationMs: number;
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE "TestWorkflowRun"
       SET status = $1, "finishedAt" = NOW(), "durationMs" = $2,
           "errorCode" = $3, "errorMessage" = $4, "updatedAt" = NOW()
       WHERE id = $5`,
      [outcome.status, outcome.durationMs, outcome.errorCode, outcome.errorMessage, runId],
    );
  }

  public async markStepStatus(
    runId: string,
    node: TestWorkflowNode,
    status: TestWorkflowStepStatus,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE "TestWorkflowStepRun"
       SET status = $1, phase = $2,
           "startedAt" = CASE WHEN $1 = $3 THEN COALESCE("startedAt", NOW()) ELSE "startedAt" END,
           "updatedAt" = NOW()
       WHERE "runId" = $4 AND "nodeId" = $5`,
      [status, node.phase, TestWorkflowStepStatus.Running, runId, node.id],
    );
  }

  public async persistStep(
    runId: string,
    node: TestWorkflowNode,
    data: StepExecutionResult,
  ): Promise<void> {
    const status = stepStatus(data);
    await this.pool.query(
      `UPDATE "TestWorkflowStepRun"
       SET status = $1, phase = $2, "requestJson" = $3, "responseJson" = $4,
           "assertionsJson" = $5, "exportsJson" = $6, "inputsJson" = $7,
           "startedAt" = COALESCE("startedAt", NOW()), "finishedAt" = NOW(), "durationMs" = $8,
           "errorCode" = $9, "errorMessage" = $10, "updatedAt" = NOW()
       WHERE "runId" = $11 AND "nodeId" = $12`,
      [
        status,
        node.phase,
        json(data.requestJson),
        json(data.responseJson),
        json(data.assertionsJson),
        json(data.exportsJson),
        json(data.inputsJson),
        data.durationMs,
        data.errorCode,
        data.errorMessage,
        runId,
        node.id,
      ],
    );
  }

  public async markQueuedNodes(
    runId: string,
    nodes: readonly TestWorkflowNode[],
    status: typeof TestWorkflowStepStatus.Canceled | typeof TestWorkflowStepStatus.Skipped,
  ): Promise<void> {
    for (const node of nodes) {
      await this.pool.query(
        `UPDATE "TestWorkflowStepRun"
         SET status = $1, phase = $2, "updatedAt" = NOW()
         WHERE "runId" = $3 AND "nodeId" = $4 AND status = $5`,
        [status, node.phase, runId, node.id, TestWorkflowStepStatus.Queued],
      );
    }
  }

  public async failStaleRuns(cutoff: Date, errorCode: string): Promise<readonly string[]> {
    const result = await this.pool.query<{ readonly id: string }>(
      `UPDATE "TestWorkflowRun"
       SET status = $1, "errorCode" = $2, "errorMessage" = $3, "finishedAt" = NOW(), "updatedAt" = NOW()
       WHERE status = $4 AND "updatedAt" < $5
       RETURNING id`,
      [
        TestWorkflowRunStatus.Failed,
        errorCode,
        "Worker was interrupted before completing the run.",
        TestWorkflowRunStatus.Running,
        cutoff,
      ],
    );
    return result.rows.map((row) => row.id);
  }
}

function json(value: unknown): string | null {
  return value === null ? null : JSON.stringify(value);
}

function stepStatus(result: StepExecutionResult): TestWorkflowStepStatus {
  switch (result.kind) {
    case "succeeded":
      return TestWorkflowStepStatus.Succeeded;
    case "failed":
      return TestWorkflowStepStatus.Failed;
    default:
      return assertNever(result);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected step result: ${JSON.stringify(value)}`);
}
