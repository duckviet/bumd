export type TestWorkflowRequestTemplate = {
  readonly serverUrl?: string | undefined;
  readonly pathParams?: Record<string, unknown> | undefined;
  readonly query?: Record<string, unknown> | undefined;
  readonly headers?: Record<string, unknown> | undefined;
  readonly body?: unknown | undefined;
};

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | {
  readonly [key: string]: JsonValue;
};

export type TestWorkflowPriority = "low" | "medium" | "high" | "critical";
export type TestWorkflowType = "smoke" | "integration" | "end_to_end" | "contract";
export type TestWorkflowNodePhase = "setup" | "test" | "teardown";

export type TestWorkflowMetadata = {
  readonly tags: readonly string[];
  readonly priority: TestWorkflowPriority;
  readonly type: TestWorkflowType;
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
      readonly expected?: string;
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
  readonly context: {
    readonly testData: Readonly<Record<string, JsonValue>>;
  };
  readonly nodes: readonly TestWorkflowNode[];
  readonly edges: readonly TestWorkflowEdge[];
  readonly viewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
};

export type TestWorkflowDto = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly tags: readonly string[];
  readonly priority: TestWorkflowPriority;
  readonly type: TestWorkflowType;
  readonly definitionJson: TestWorkflowDefinition;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type UpdateTestWorkflowBody = {
  readonly expectedRevision: number;
  readonly name?: string;
  readonly description?: string | null;
  readonly tags?: readonly string[];
  readonly priority?: TestWorkflowPriority;
  readonly type?: TestWorkflowType;
  readonly definitionJson?: TestWorkflowDefinition;
};

export type TestEnvironmentVariableDto = {
  readonly id: string;
  readonly key: string;
  readonly secret: boolean;
  readonly hasValue: boolean;
};

export type TestEnvironmentDto = {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly variables: readonly TestEnvironmentVariableDto[];
};

export type TestWorkflowRunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type TestWorkflowStepStatus = "queued" | "running" | "succeeded" | "failed" | "skipped" | "canceled";

export type TestEnvironmentSnapshotDescriptor = {
  readonly id: string;
  readonly name: string;
  readonly variables: readonly TestEnvironmentVariableDto[];
};

export type TestWorkflowStepInput =
  | { readonly type: "env"; readonly key: string; readonly value: unknown }
  | { readonly type: "data"; readonly key: string; readonly value: JsonValue }
  | { readonly type: "var"; readonly name: string; readonly value: unknown };

export type TestWorkflowRunDto = {
  readonly id: string;
  readonly workflowId: string;
  readonly versionId: string;
  readonly environmentId: string | null;
  readonly status: TestWorkflowRunStatus;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
};

export type TestWorkflowStepRunDto = {
  readonly id: string;
  readonly nodeId: string;
  readonly operationId: string;
  readonly phase: TestWorkflowNodePhase;
  readonly status: TestWorkflowStepStatus;
  readonly request: unknown;
  readonly response: unknown;
  readonly inputs: readonly TestWorkflowStepInput[];
  readonly exports: unknown;
  readonly assertions: unknown;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly error: { readonly code: string; readonly message: string } | null;
};

export type TestWorkflowRunDetailDto = TestWorkflowRunDto & {
  readonly metadataSnapshot: TestWorkflowMetadata;
  readonly definitionSnapshot: TestWorkflowDefinition;
  readonly environmentSnapshot: TestEnvironmentSnapshotDescriptor | null;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly steps: readonly TestWorkflowStepRunDto[];
};
