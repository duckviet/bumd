import { z } from "zod";

const schemaObject = z.record(z.string(), z.unknown());

const parameterSchema = z.object({
  name: z.string(),
  in: z.string(),
  required: z.boolean().optional(),
  schema: schemaObject.optional(),
});

const operationSchema = z.object({
  operationId: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  parameters: z.array(parameterSchema).optional(),
  responses: z.record(z.string(), z.unknown()).optional(),
});

const pathItemSchema = z.record(z.string(), operationSchema);

const openApiSchema = z.object({
  info: z.object({
    title: z.string().optional(),
    version: z.string().optional(),
  }).optional(),
  servers: z.array(z.object({ url: z.string() })).optional(),
  paths: z.record(z.string(), pathItemSchema).optional(),
  components: z.object({
    schemas: z.record(z.string(), schemaObject).optional(),
  }).optional(),
});

export type ApiOperation = {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly summary: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly parameters: readonly {
    readonly name: string;
    readonly location: string;
    readonly required: boolean;
  }[];
};

export type ApiSchemaSummary = {
  readonly name: string;
  readonly type: string;
  readonly properties: readonly string[];
};

export type ApiDocument = {
  readonly title: string;
  readonly version: string;
  readonly servers: readonly string[];
  readonly operations: readonly ApiOperation[];
  readonly schemas: readonly ApiSchemaSummary[];
};

export function parseOpenApiDocument(spec: Record<string, unknown>): ApiDocument {
  const parsed = openApiSchema.parse(spec);
  return {
    title: parsed.info?.title ?? "API Reference",
    version: parsed.info?.version ?? "latest",
    servers: (parsed.servers ?? []).map((server) => server.url),
    operations: operationsFromPaths(parsed.paths ?? {}),
    schemas: schemasFromComponents(parsed.components?.schemas ?? {}),
  };
}

function operationsFromPaths(paths: Record<string, Record<string, z.infer<typeof operationSchema>>>): readonly ApiOperation[] {
  return Object.entries(paths).flatMap(([path, item]) => Object.entries(item).map(([method, operation]) => {
    const id = operation.operationId ?? `${method}-${path.replace(/[^a-z0-9]+/giu, "-")}`;
    return {
      id,
      method: method.toUpperCase(),
      path,
      summary: operation.summary ?? id,
      description: typeof operation.description === "string" ? operation.description : "",
      tags: Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === "string") : [],
      parameters: (operation.parameters ?? []).map((parameter) => ({
        name: parameter.name,
        location: parameter.in,
        required: parameter.required ?? false,
      })),
    };
  }));
}

function schemasFromComponents(schemas: Record<string, Record<string, unknown>>): readonly ApiSchemaSummary[] {
  return Object.entries(schemas).map(([name, schema]) => ({
    name,
    type: typeof schema["type"] === "string" ? schema["type"] : "schema",
    properties: propertyNames(schema["properties"]),
  }));
}

function propertyNames(value: unknown): readonly string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value);
}
