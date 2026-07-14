import { z } from "zod";
import type { JsonValue, TestWorkflowDefinition, TestWorkflowMetadata, TestWorkflowNodePhase } from "./test-workflow-types.js";

// ─── Primitives ───────────────────────────────────────────────────────────────

const TestDataKeySchema = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/u, "Key must be a valid identifier");

const ExportNameSchema = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/u, "Export name must be a valid identifier");

const WorkflowTagSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/u, "Tag must be lowercase alphanumeric with dashes");

export const WorkflowTagsSchema = z
  .array(z.string())
  .transform((tags) => [...new Set(tags.map((tag) => tag.trim().toLowerCase()))])
  .pipe(z.array(WorkflowTagSchema));

export const WorkflowMetadataSchema = z.object({
  tags: WorkflowTagsSchema,
  priority: z.enum(["low", "medium", "high", "critical"]),
  type: z.enum(["smoke", "integration", "end_to_end", "contract"]),
}).strict() satisfies z.ZodType<TestWorkflowMetadata>;

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const TestDataSchema = z
  .record(TestDataKeySchema, JsonValueSchema)
  .superRefine((testData, context) => {
    if (Object.keys(testData).length > 100) {
      context.addIssue({
        code: "custom",
        message: "testData must contain at most 100 entries",
      });
    }
    if (Buffer.byteLength(JSON.stringify(testData), "utf8") > 65_536) {
      context.addIssue({
        code: "custom",
        message: "testData must serialize to at most 64 KiB",
      });
    }
  });

// ─── Request Template ─────────────────────────────────────────────────────────

export const RequestTemplateSchema = z.object({
  serverUrl: z.string().optional(),
  pathParams: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.unknown()).optional(),
  body: z.unknown().optional(),
}).strict();

// ─── Export Schema ────────────────────────────────────────────────────────────

export const ExportSchema = z.object({
  name: ExportNameSchema,
  source: z.enum(["status", "header", "body"]),
  path: z.string().optional(),
  headerName: z.string().optional(),
}).strict();

// ─── Assertion Schema ─────────────────────────────────────────────────────────

const StatusAssertionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("status"),
  operator: z.enum(["equals", "notEquals", "in"]),
  expected: z.union([z.number().int(), z.array(z.number().int())]),
}).strict();

const JsonPathAssertionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("jsonPath"),
  path: z.string().min(1),
  operator: z.enum(["exists", "equals", "notEquals", "contains"]),
  expected: z.unknown().optional(),
}).strict();

const HeaderAssertionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("header"),
  name: z.string().min(1),
  operator: z.enum(["exists", "equals", "contains"]),
  expected: z.string().optional(),
}).strict();

const ResponseTimeAssertionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("responseTime"),
  operator: z.literal("lessThan"),
  expectedMs: z.number().int().positive(),
}).strict();

export const AssertionSchema = z.discriminatedUnion("type", [
  StatusAssertionSchema,
  JsonPathAssertionSchema,
  HeaderAssertionSchema,
  ResponseTimeAssertionSchema,
]);

// ─── Node Schema ──────────────────────────────────────────────────────────────

const NodeBaseShape = {
  id: z.string().min(1),
  type: z.literal("endpoint"),
  operationId: z.string().min(1),
  method: z.string().min(1),
  path: z.string().startsWith("/"),
  label: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }).strict(),
  requestTemplate: RequestTemplateSchema,
  exports: z.array(ExportSchema),
  assertions: z.array(AssertionSchema),
};

const V1NodeSchema = z.object(NodeBaseShape).strict();

export const NodeSchema = z.object({
  ...NodeBaseShape,
  phase: z.enum(["setup", "test", "teardown"]),
}).strict();

// ─── Edge Schema ──────────────────────────────────────────────────────────────

export const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
}).strict();

// ─── Root Definition Schema ───────────────────────────────────────────────────

const ViewportSchema = z.object({ x: z.number(), y: z.number(), zoom: z.number() }).strict();

const WorkflowDefinitionV1Schema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(V1NodeSchema),
  edges: z.array(EdgeSchema),
  viewport: ViewportSchema.optional(),
}).strict();

const WorkflowDefinitionV2Schema = z.object({
  schemaVersion: z.literal(2),
  context: z.object({ testData: TestDataSchema }).strict(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  viewport: ViewportSchema.optional(),
}).strict();

const WorkflowDefinitionInputSchema = z.discriminatedUnion("schemaVersion", [
  WorkflowDefinitionV1Schema,
  WorkflowDefinitionV2Schema,
]);

export const WorkflowDefinitionSchema = WorkflowDefinitionInputSchema.transform(
  (definition): TestWorkflowDefinition => {
    switch (definition.schemaVersion) {
      case 1:
        return {
          schemaVersion: 2,
          context: { testData: {} },
          nodes: definition.nodes.map((node) => ({ ...node, phase: "test" })),
          edges: definition.edges,
          ...(definition.viewport === undefined ? {} : { viewport: definition.viewport }),
        };
      case 2:
        return definition;
    }
  },
);

export type WorkflowDefinitionInput = z.input<typeof WorkflowDefinitionSchema>;

// ─── Structural Validation (save-time) ───────────────────────────────────────
// Validates Zod shape + DAG structural rules. Does NOT validate operationId
// existence in the latest API version (run-time only).

export function parseAndValidateDefinition(raw: unknown): TestWorkflowDefinition {
  const result = WorkflowDefinitionSchema.safeParse(raw);
  if (!result.success) {
    throw result.error;
  }
  const def = result.data;

  // Unique node IDs
  const nodeIds = new Set<string>();
  for (const node of def.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // Unique edge IDs + valid source/target
  const edgeIds = new Set<string>();
  for (const edge of def.edges) {
    if (edgeIds.has(edge.id)) {
      throw new Error(`Duplicate edge id: ${edge.id}`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) {
      throw new Error(`Edge ${edge.id} source "${edge.source}" does not exist`);
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`Edge ${edge.id} target "${edge.target}" does not exist`);
    }
  }

  const nodesById = new Map(def.nodes.map((node) => [node.id, node]));
  for (const edge of def.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source === undefined || target === undefined) {
      continue;
    }
    if (phaseOrder(source.phase) > phaseOrder(target.phase)) {
      throw new Error(
        `Invalid phase edge: ${source.id} (${source.phase}) -> ${target.id} (${target.phase})`,
      );
    }
  }

  // Unique export names globally
  const exportNames = new Set<string>();
  for (const node of def.nodes) {
    for (const exp of node.exports) {
      if (exportNames.has(exp.name)) {
        throw new Error(`Duplicate export name: ${exp.name}`);
      }
      exportNames.add(exp.name);
    }
  }

  // Cycle detection via Kahn's algorithm
  detectCycle(def.nodes.map((n) => n.id), def.edges);

  return def;
}

function detectCycle(
  nodeIds: readonly string[],
  edges: readonly { readonly source: string; readonly target: string }[],
): void {
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));

  for (const edge of edges) {
    const neighbors = adj.get(edge.source);
    if (neighbors === undefined) {
      throw new Error(`Unknown source node: ${edge.source}`);
    }
    neighbors.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    processed++;
    for (const neighbor of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (processed !== nodeIds.length) {
    throw new Error("WORKFLOW_CYCLE");
  }
}

function phaseOrder(phase: TestWorkflowNodePhase): number {
  switch (phase) {
    case "setup":
      return 0;
    case "test":
      return 1;
    case "teardown":
      return 2;
  }
}
