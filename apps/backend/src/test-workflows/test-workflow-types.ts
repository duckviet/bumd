// ─── Run & Step Status ────────────────────────────────────────────────────────

export const TestWorkflowRunStatus = {
  Queued: "queued",
  Running: "running",
  Succeeded: "succeeded",
  Failed: "failed",
  Canceled: "canceled",
} as const;

export type TestWorkflowRunStatus = (typeof TestWorkflowRunStatus)[keyof typeof TestWorkflowRunStatus];

export const TerminalRunStatuses = new Set<TestWorkflowRunStatus>([
  TestWorkflowRunStatus.Succeeded,
  TestWorkflowRunStatus.Failed,
  TestWorkflowRunStatus.Canceled,
]);

export const TestWorkflowStepStatus = {
  Queued: "queued",
  Running: "running",
  Succeeded: "succeeded",
  Failed: "failed",
  Skipped: "skipped",
  Canceled: "canceled",
} as const;

export type TestWorkflowStepStatus = (typeof TestWorkflowStepStatus)[keyof typeof TestWorkflowStepStatus];

export const TerminalStepStatuses = new Set<TestWorkflowStepStatus>([
  TestWorkflowStepStatus.Succeeded,
  TestWorkflowStepStatus.Failed,
  TestWorkflowStepStatus.Skipped,
  TestWorkflowStepStatus.Canceled,
]);

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const TestWorkflowErrorCode = {
  NoReadyVersion: "NO_READY_VERSION",
  WorkflowInvalid: "WORKFLOW_INVALID",
  WorkflowCycle: "WORKFLOW_CYCLE",
  WorkflowStaleOperation: "WORKFLOW_STALE_OPERATION",
  WorkflowConflict: "WORKFLOW_CONFLICT",
  WorkflowSlugConflict: "WORKFLOW_SLUG_CONFLICT",
  EnvNotFound: "ENV_NOT_FOUND",
  EnvRequired: "ENV_REQUIRED",
  EnvVarMissing: "ENV_VAR_MISSING",
  TestDataMissing: "TEST_DATA_MISSING",
  VarRefInvalid: "VAR_REF_INVALID",
  VarRefNotAncestor: "VAR_REF_NOT_ANCESTOR",
  RequestBlocked: "REQUEST_BLOCKED",
  RequestTimeout: "REQUEST_TIMEOUT",
  RequestFailed: "REQUEST_FAILED",
  AssertionFailed: "ASSERTION_FAILED",
  ExportFailed: "EXPORT_FAILED",
  WorkerInterrupted: "WORKER_INTERRUPTED",
  RunFailed: "RUN_FAILED",
  RunAlreadyTerminal: "RUN_ALREADY_TERMINAL",
  InternalError: "INTERNAL_ERROR",
} as const;

export type TestWorkflowErrorCode = (typeof TestWorkflowErrorCode)[keyof typeof TestWorkflowErrorCode];

// ─── Definition Domain Types ──────────────────────────────────────────────────

export const TestWorkflowPriority = {
  Low: "low", Medium: "medium", High: "high", Critical: "critical",
} as const;

export type TestWorkflowPriority = (typeof TestWorkflowPriority)[keyof typeof TestWorkflowPriority];

export const TestWorkflowType = {
  Smoke: "smoke", Integration: "integration", EndToEnd: "end_to_end", Contract: "contract",
} as const;

export type TestWorkflowType = (typeof TestWorkflowType)[keyof typeof TestWorkflowType];

export type TestWorkflowTag = string;

export type TestWorkflowMetadata = Readonly<{ tags: readonly TestWorkflowTag[]; priority: TestWorkflowPriority; type: TestWorkflowType }>;

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | {
  readonly [key: string]: JsonValue;
};

export type TestWorkflowContext = {
  readonly testData: Readonly<Record<string, JsonValue>>;
};

export const TestWorkflowNodePhase = {
  Setup: "setup", Test: "test", Teardown: "teardown",
} as const;

export type TestWorkflowNodePhase = (typeof TestWorkflowNodePhase)[keyof typeof TestWorkflowNodePhase];

export type TestWorkflowRequestTemplate = {
  readonly serverUrl?: string | undefined;
  readonly pathParams?: Record<string, unknown> | undefined;
  readonly query?: Record<string, unknown> | undefined;
  readonly headers?: Record<string, unknown> | undefined;
  readonly body?: unknown;
};

export type TestWorkflowExport = {
  readonly name: string;
  readonly source: "status" | "header" | "body";
  readonly path?: string | undefined;
  readonly headerName?: string | undefined;
};

export type TestWorkflowAssertion =
  | {
      readonly id: string;
      readonly type: "status";
      readonly operator: "equals" | "notEquals" | "in";
      readonly expected: number | number[];
    }
  | {
      readonly id: string;
      readonly type: "jsonPath";
      readonly path: string;
      readonly operator: "exists" | "equals" | "notEquals" | "contains";
      readonly expected?: unknown;
    }
  | {
      readonly id: string;
      readonly type: "header";
      readonly name: string;
      readonly operator: "exists" | "equals" | "contains";
      readonly expected?: string | undefined;
    }
  | {
      readonly id: string;
      readonly type: "responseTime";
      readonly operator: "lessThan";
      readonly expectedMs: number;
    };

export type TestWorkflowNode = {
  readonly id: string;
  readonly type: "endpoint";
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly label: string;
  readonly phase: TestWorkflowNodePhase;
  readonly position: { readonly x: number; readonly y: number };
  readonly requestTemplate: TestWorkflowRequestTemplate;
  readonly exports: readonly TestWorkflowExport[];
  readonly assertions: readonly TestWorkflowAssertion[];
};

export type TestWorkflowEdge = {
  readonly id: string;
  readonly source: string;
  readonly target: string;
};

export type TestWorkflowDefinition = {
  readonly schemaVersion: 2;
  readonly context: TestWorkflowContext;
  readonly nodes: readonly TestWorkflowNode[];
  readonly edges: readonly TestWorkflowEdge[];
  readonly viewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  } | undefined;
};

export type TestWorkflowDefinitionV1 = {
  readonly schemaVersion: 1;
  readonly nodes: readonly Omit<TestWorkflowNode, "phase">[];
  readonly edges: readonly TestWorkflowEdge[];
  readonly viewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  } | undefined;
};

export type TestWorkflowDefinitionInput = TestWorkflowDefinitionV1 | TestWorkflowDefinition;

export const EmptyWorkflowDefinition: TestWorkflowDefinition = {
  schemaVersion: 2,
  context: { testData: {} },
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

// ─── DB Record Types ──────────────────────────────────────────────────────────

export type TestWorkflowRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly definitionJson: unknown;
  readonly revision: number;
  readonly createdByUserId: string;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type TestEnvironmentRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type TestEnvironmentVariableRecord = {
  readonly id: string;
  readonly environmentId: string;
  readonly key: string;
  readonly encryptedValue: string | null;
  readonly secret: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type TestWorkflowRunRecord = {
  readonly id: string;
  readonly workflowId: string;
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly versionId: string;
  readonly environmentId: string | null;
  readonly status: TestWorkflowRunStatus;
  readonly startedByUserId: string | null;
  readonly startedByTokenId: string | null;
  readonly definitionSnapshotJson: unknown;
  readonly cancelRequestedAt: Date | null;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly durationMs: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type TestWorkflowStepRunRecord = {
  readonly id: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly operationId: string;
  readonly status: TestWorkflowStepStatus;
  readonly requestJson: unknown;
  readonly responseJson: unknown;
  readonly assertionsJson: unknown;
  readonly exportsJson: unknown;
  readonly inputsJson: unknown;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly durationMs: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── ID Prefix Helpers ────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";

export function newWorkflowId(): string {
  return `twf_${randomUUID()}`;
}

export function newEnvironmentId(): string {
  return `tenv_${randomUUID()}`;
}

export function newEnvironmentVariableId(): string {
  return `tenvv_${randomUUID()}`;
}

export function newRunId(): string {
  return `twr_${randomUUID()}`;
}

export function newStepRunId(): string {
  return `tws_${randomUUID()}`;
}
