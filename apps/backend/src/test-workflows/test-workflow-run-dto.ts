import { WorkflowMetadataSchema } from "./test-workflow-definition.schema.js";
import {
  parseEncryptedEnvironmentSnapshot,
  parseStepPhase,
  sanitizeEnvironmentSnapshot,
  sanitizeStepInputs,
} from "./test-workflow-snapshots.js";
import type {
  TestWorkflowMetadata,
  TestWorkflowRunRecord,
  TestWorkflowStepRunRecord,
} from "./test-workflow-types.js";

export type SnapshotWorkflowRunRecord = TestWorkflowRunRecord & {
  readonly metadataSnapshotJson: unknown;
  readonly environmentSnapshotJson: unknown | null;
};

export type PhasedStepRunRecord = TestWorkflowStepRunRecord & { readonly phase: string };

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
  readonly phase: string;
  readonly status: string;
  readonly request: unknown;
  readonly response: unknown;
  readonly inputs: unknown;
  readonly exports: unknown;
  readonly assertions: unknown;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly error: { readonly code: string; readonly message: string } | null;
};

export type TestWorkflowRunDetailDto = TestWorkflowRunListItemDto & {
  readonly metadataSnapshot: TestWorkflowMetadata;
  readonly definitionSnapshot: unknown;
  readonly environmentSnapshot: ReturnType<typeof sanitizeEnvironmentSnapshot> | null;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly steps: readonly TestWorkflowStepRunDto[];
};

export function mapRunListItem(row: SnapshotWorkflowRunRecord): TestWorkflowRunListItemDto {
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

export function mapRunDetail(
  run: SnapshotWorkflowRunRecord,
  steps: readonly PhasedStepRunRecord[],
): TestWorkflowRunDetailDto {
  const environmentSnapshot = run.environmentSnapshotJson === null
    ? null
    : parseEncryptedEnvironmentSnapshot(run.environmentSnapshotJson);
  const secretEnvironmentKeys = environmentSnapshot === null
    ? null
    : new Set(environmentSnapshot.variables.filter((variable) => variable.secret).map((variable) => variable.key));

  return {
    ...mapRunListItem(run),
    metadataSnapshot: WorkflowMetadataSchema.parse(run.metadataSnapshotJson),
    definitionSnapshot: run.definitionSnapshotJson,
    environmentSnapshot: environmentSnapshot === null ? null : sanitizeEnvironmentSnapshot(environmentSnapshot),
    error: run.errorCode === null ? null : { code: run.errorCode, message: run.errorMessage ?? "" },
    steps: steps.map((step) => ({
      id: step.id,
      nodeId: step.nodeId,
      operationId: step.operationId,
      phase: parseStepPhase(step.phase),
      status: step.status,
      request: step.requestJson,
      response: step.responseJson,
      inputs: sanitizeStepInputs(step.inputsJson, secretEnvironmentKeys),
      exports: step.exportsJson,
      assertions: step.assertionsJson,
      startedAt: step.startedAt?.toISOString() ?? null,
      finishedAt: step.finishedAt?.toISOString() ?? null,
      durationMs: step.durationMs,
      error: step.errorCode === null ? null : { code: step.errorCode, message: step.errorMessage ?? "" },
    })),
  };
}
