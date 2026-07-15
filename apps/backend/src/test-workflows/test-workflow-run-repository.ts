import type { Pool } from "pg";
import { VersionStatus } from "../versions/deploy-types.js";
import type { EncryptedEnvironmentSnapshot } from "./test-workflow-snapshots.js";
import {
  TestWorkflowRunStatus,
  TestWorkflowStepStatus,
  newStepRunId,
  type TestWorkflowDefinition,
  type TestWorkflowMetadata,
} from "./test-workflow-types.js";
import type {
  PhasedStepRunRecord,
  SnapshotWorkflowRunRecord,
} from "./test-workflow-run-dto.js";

export type RunScope = {
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly workflowId: string;
  readonly runId: string;
};

export type PersistRunInput = {
  readonly scope: Omit<RunScope, "runId">;
  readonly runId: string;
  readonly versionId: string;
  readonly environmentId: string | null;
  readonly startedByUserId: string | null;
  readonly startedByTokenId: string | null;
  readonly definition: TestWorkflowDefinition;
  readonly metadata: TestWorkflowMetadata;
  readonly environmentSnapshot: EncryptedEnvironmentSnapshot | null;
};

export async function persistRun(pool: Pool, input: PersistRunInput): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "TestWorkflowRun"
         (id, "workflowId", "organizationId", "docId", "branchId", "versionId",
          "environmentId", status, "startedByUserId", "startedByTokenId",
          "definitionSnapshotJson", "metadataSnapshotJson", "environmentSnapshotJson",
          "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        input.runId,
        input.scope.workflowId,
        input.scope.organizationId,
        input.scope.docId,
        input.scope.branchId,
        input.versionId,
        input.environmentId,
        TestWorkflowRunStatus.Queued,
        input.startedByUserId,
        input.startedByTokenId,
        JSON.stringify(input.definition),
        JSON.stringify(input.metadata),
        input.environmentSnapshot === null ? null : JSON.stringify(input.environmentSnapshot),
      ],
    );
    for (const node of input.definition.nodes) {
      await client.query(
        `INSERT INTO "TestWorkflowStepRun"
           (id, "runId", "nodeId", "operationId", phase, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [newStepRunId(), input.runId, node.id, node.operationId, node.phase, TestWorkflowStepStatus.Queued],
      );
    }
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findRun(pool: Pool, scope: RunScope): Promise<SnapshotWorkflowRunRecord | null> {
  const result = await pool.query<SnapshotWorkflowRunRecord>(
    `SELECT * FROM "TestWorkflowRun"
     WHERE id = $1 AND "workflowId" = $2 AND "organizationId" = $3
       AND "docId" = $4 AND "branchId" = $5
     LIMIT 1`,
    [scope.runId, scope.workflowId, scope.organizationId, scope.docId, scope.branchId],
  );
  return result.rows[0] ?? null;
}

export async function findRunSteps(pool: Pool, runId: string): Promise<readonly PhasedStepRunRecord[]> {
  const result = await pool.query<PhasedStepRunRecord>(
    `SELECT * FROM "TestWorkflowStepRun" WHERE "runId" = $1 ORDER BY "createdAt" ASC`,
    [runId],
  );
  return result.rows;
}

export async function findRuns(input: {
  readonly pool: Pool;
  readonly scope: Omit<RunScope, "runId">;
  readonly cursorDate: string | null;
  readonly limit: number;
}): Promise<readonly SnapshotWorkflowRunRecord[]> {
  const result = await input.pool.query<SnapshotWorkflowRunRecord>(
    `SELECT id, "workflowId", "organizationId", "docId", "branchId", "versionId",
            "environmentId", status, "startedByUserId", "startedByTokenId",
            "definitionSnapshotJson", "metadataSnapshotJson", "environmentSnapshotJson", "cancelRequestedAt",
            "startedAt", "finishedAt", "durationMs", "errorCode", "errorMessage", "createdAt", "updatedAt"
     FROM "TestWorkflowRun"
     WHERE "workflowId" = $1 AND "organizationId" = $2 AND "docId" = $3 AND "branchId" = $4
       ${input.cursorDate === null ? "" : `AND "createdAt" < $5`}
     ORDER BY "createdAt" DESC
     LIMIT ${input.limit + 1}`,
    input.cursorDate === null
      ? [input.scope.workflowId, input.scope.organizationId, input.scope.docId, input.scope.branchId]
      : [input.scope.workflowId, input.scope.organizationId, input.scope.docId, input.scope.branchId, input.cursorDate],
  );
  return result.rows;
}

export async function requestRunCancel(pool: Pool, runId: string): Promise<void> {
  await pool.query(
    `UPDATE "TestWorkflowRun"
     SET "cancelRequestedAt" = NOW(), "updatedAt" = NOW()
     WHERE id = $1 AND "cancelRequestedAt" IS NULL`,
    [runId],
  );
}

export async function findLatestReadyVersion(input: {
  readonly pool: Pool;
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
}): Promise<{ readonly id: string } | null> {
  const result = await input.pool.query<{ id: string }>(
    `SELECT id FROM "Version"
     WHERE "organizationId" = $1 AND "docId" = $2 AND "branchId" = $3 AND status = $4
     ORDER BY "readyAt" DESC NULLS LAST, "createdAt" DESC
     LIMIT 1`,
    [input.organizationId, input.docId, input.branchId, VersionStatus.Ready],
  );
  return result.rows[0] ?? null;
}
