import { z } from "zod";

// ─── Primitives ───────────────────────────────────────────────────────────────

const templateStringSchema = z.string();

// ─── Request Template ─────────────────────────────────────────────────────────

export const RequestTemplateSchema = z.object({
  serverUrl: z.string().optional(),
  pathParams: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.unknown()).optional(),
  body: z.unknown().optional(),
});

// ─── Export Schema ────────────────────────────────────────────────────────────

export const ExportSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/u, "Export name must be a valid identifier"),
  source: z.enum(["status", "header", "body"]),
  path: z.string().optional(),
  headerName: z.string().optional(),
});

// ─── Assertion Schema ─────────────────────────────────────────────────────────

const StatusAssertionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("status"),
  operator: z.enum(["equals", "notEquals", "in"]),
  expected: z.union([z.number().int(), z.array(z.number().int())]),
});

const JsonPathAssertionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("jsonPath"),
  path: z.string().min(1),
  operator: z.enum(["exists", "equals", "notEquals", "contains"]),
  expected: z.unknown().optional(),
});

const HeaderAssertionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("header"),
  name: z.string().min(1),
  operator: z.enum(["exists", "equals", "contains"]),
  expected: z.string().optional(),
});

const ResponseTimeAssertionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("responseTime"),
  operator: z.literal("lessThan"),
  expectedMs: z.number().int().positive(),
});

export const AssertionSchema = z.discriminatedUnion("type", [
  StatusAssertionSchema,
  JsonPathAssertionSchema,
  HeaderAssertionSchema,
  ResponseTimeAssertionSchema,
]);

// ─── Node Schema ──────────────────────────────────────────────────────────────

export const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("endpoint"),
  operationId: z.string().min(1),
  method: z.string().min(1),
  path: z.string().startsWith("/"),
  label: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  requestTemplate: RequestTemplateSchema,
  exports: z.array(ExportSchema),
  assertions: z.array(AssertionSchema),
});

// ─── Edge Schema ──────────────────────────────────────────────────────────────

export const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

// ─── Root Definition Schema ───────────────────────────────────────────────────

export const WorkflowDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .optional(),
});

export type WorkflowDefinitionInput = z.infer<typeof WorkflowDefinitionSchema>;

// ─── Structural Validation (save-time) ───────────────────────────────────────
// Validates Zod shape + DAG structural rules. Does NOT validate operationId
// existence in the latest API version (run-time only).

export function parseAndValidateDefinition(raw: unknown): WorkflowDefinitionInput {
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
    adj.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
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
