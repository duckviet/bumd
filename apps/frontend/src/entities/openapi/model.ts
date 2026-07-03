import { z } from "zod";

const schemaObject = z.record(z.string(), z.unknown());

const parameterSchema = z.union([
  z.object({
    name: z.string(),
    in: z.string(),
    required: z.boolean().optional(),
    schema: schemaObject.optional(),
    description: z.string().optional(),
  }),
  z.object({ $ref: z.string() }),
]);

const operationSchema = z.object({
  operationId: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  parameters: z.array(parameterSchema).optional(),
  responses: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const pathItemSchema = z.object({
  get: operationSchema.optional(),
  put: operationSchema.optional(),
  post: operationSchema.optional(),
  delete: operationSchema.optional(),
  options: operationSchema.optional(),
  head: operationSchema.optional(),
  patch: operationSchema.optional(),
  trace: operationSchema.optional(),
}).catchall(z.unknown());

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
  readonly referencedSchemas: readonly string[];
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

function findReferencedSchemas(obj: unknown): readonly string[] {
  const refs = new Set<string>();

  function recurse(current: unknown): void {
    if (typeof current !== "object" || current === null) {
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        recurse(item);
      }
      return;
    }
    for (const [key, value] of Object.entries(current)) {
      if (key === "$ref" && typeof value === "string") {
        if (value.startsWith("#/components/schemas/")) {
          refs.add(value.substring("#/components/schemas/".length));
        }
      } else {
        recurse(value);
      }
    }
  }

  recurse(obj);
  return Array.from(refs);
}

function resolveAllReferencedSchemas(directRefs: readonly string[], allSchemas: Record<string, unknown>): readonly string[] {
  const resolved = new Set<string>();
  const queue = [...directRefs];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || resolved.has(current)) {
      continue;
    }
    resolved.add(current);

    const schemaObj = allSchemas[current];
    if (schemaObj !== undefined) {
      const subRefs = findReferencedSchemas(schemaObj);
      for (const ref of subRefs) {
        if (!resolved.has(ref)) {
          queue.push(ref);
        }
      }
    }
  }

  return Array.from(resolved);
}

export function parseOpenApiDocument(spec: Record<string, unknown>): ApiDocument {
  const parsed = openApiSchema.parse(spec);
  const rawSchemas = parsed.components?.schemas ?? {};
  const baseOperations = operationsFromPaths(parsed.paths ?? {});
  
  const operations = baseOperations.map((op) => {
    const pathItem = parsed.paths?.[op.path];
    const rawOperation = pathItem?.[op.method.toLowerCase() as HttpMethod];
    const directRefs = rawOperation !== undefined ? findReferencedSchemas(rawOperation) : [];
    const referencedSchemas = resolveAllReferencedSchemas(directRefs, rawSchemas);
    return {
      ...op,
      referencedSchemas,
    };
  });

  return {
    title: parsed.info?.title ?? "API Reference",
    version: parsed.info?.version ?? "latest",
    servers: (parsed.servers ?? []).map((server) => server.url),
    operations,
    schemas: schemasFromComponents(rawSchemas),
  };
}

function operationsFromPaths(paths: Record<string, z.infer<typeof pathItemSchema>>): readonly Omit<ApiOperation, "referencedSchemas">[] {
  return Object.entries(paths).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      if (operation === undefined || typeof operation !== "object") return [];
      const id = operation.operationId ?? `${method}-${path.replace(/[^a-z0-9]+/giu, "-")}`;
      return [{
        id,
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? id,
        description: typeof operation.description === "string" ? operation.description : "",
        tags: Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === "string") : [],
        parameters: (operation.parameters ?? [])
          .filter((parameter): parameter is Extract<typeof parameter, { name: string }> => "name" in parameter)
          .map((parameter) => ({
            name: parameter.name,
            location: parameter.in,
            required: parameter.required ?? false,
          })),
      }];
    })
  );
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
