import { z } from "zod";

const schemaObject = z.record(z.string(), z.unknown());

const parameterSchema = z.union([
  z.object({
    name: z.string(),
    in: z.string(),
    required: z.boolean().optional(),
    schema: schemaObject.optional(),
    description: z.string().optional(),
    example: z.unknown().optional(),
    default: z.unknown().optional(),
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
    readonly description?: string | undefined;
    readonly schemaType?: string | undefined;
    readonly example?: string | number | boolean | undefined;
    readonly default?: string | number | boolean | undefined;
  }[];
  readonly referencedSchemas: readonly string[];
  readonly requestBody?: {
    readonly required: boolean;
    readonly contentType: string;
    readonly exampleText?: string | undefined;
  } | null | undefined;
};

export type ApiPropertyDetail = {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
};

export type ApiSchemaSummary = {
  readonly name: string;
  readonly type: string;
  readonly properties: readonly ApiPropertyDetail[];
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

function getExampleTextFromSchema(schema: unknown): string {
  if (schema === null || typeof schema !== "object") {
    return "{\n  \n}";
  }
  const s = schema as Record<string, unknown>;
  if (s["example"] !== undefined) {
    return typeof s["example"] === "string" ? s["example"] : JSON.stringify(s["example"], null, 2);
  }
  if (s["type"] === "object" && s["properties"] && typeof s["properties"] === "object" && s["properties"] !== null) {
    const props = s["properties"] as Record<string, unknown>;
    const obj: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(props)) {
      if (prop && typeof prop === "object") {
        const p = prop as Record<string, unknown>;
        if (p["example"] !== undefined) {
          obj[key] = p["example"];
        } else if (p["default"] !== undefined) {
          obj[key] = p["default"];
        } else if (p["type"] === "string") {
          obj[key] = "";
        } else if (p["type"] === "integer" || p["type"] === "number") {
          obj[key] = 0;
        } else if (p["type"] === "boolean") {
          obj[key] = false;
        } else if (p["type"] === "array") {
          obj[key] = [];
        } else if (p["type"] === "object") {
          obj[key] = {};
        } else {
          obj[key] = null;
        }
      }
    }
    return JSON.stringify(obj, null, 2);
  }
  return "{\n  \n}";
}

function operationsFromPaths(paths: Record<string, z.infer<typeof pathItemSchema>>): readonly Omit<ApiOperation, "referencedSchemas">[] {
  return Object.entries(paths).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      if (operation === undefined || typeof operation !== "object") return [];
      const id = operation.operationId ?? `${method}-${path.replace(/[^a-z0-9]+/giu, "-")}`;
      
      const operationObj = operation as Record<string, unknown>;
      const requestBody = operationObj["requestBody"];
      let parsedBody: ApiOperation["requestBody"] = null;
      if (requestBody && typeof requestBody === "object") {
        const rb = requestBody as Record<string, unknown>;
        const required = rb["required"] === true;
        const content = rb["content"];
        if (content && typeof content === "object") {
          const contentObj = content as Record<string, unknown>;
          const jsonContent = contentObj["application/json"] as Record<string, unknown> | undefined;
          if (jsonContent) {
            const example = jsonContent["example"] ?? jsonContent["examples"];
            let exampleText = "";
            if (example !== undefined) {
              exampleText = typeof example === "string" ? example : JSON.stringify(example, null, 2);
            } else if (jsonContent["schema"]) {
              exampleText = getExampleTextFromSchema(jsonContent["schema"]);
            }
            parsedBody = {
              required,
              contentType: "application/json",
              exampleText,
            };
          } else {
            const contentTypes = Object.keys(contentObj);
            if (contentTypes.length > 0) {
              const ct = contentTypes[0];
              if (ct !== undefined) {
                const ctVal = contentObj[ct] as Record<string, unknown> | undefined;
                if (ctVal) {
                  let exampleText = "";
                  if (ctVal["example"] !== undefined) {
                    exampleText = typeof ctVal["example"] === "string" ? ctVal["example"] : JSON.stringify(ctVal["example"], null, 2);
                  } else if (ctVal["schema"]) {
                    exampleText = getExampleTextFromSchema(ctVal["schema"]);
                  }
                  parsedBody = {
                    required,
                    contentType: ct,
                    exampleText,
                  };
                }
              }
            }
          }
        }
      }

      return [{
        id,
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? id,
        description: typeof operation.description === "string" ? operation.description : "",
        tags: Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === "string") : [],
        parameters: (operation.parameters ?? [])
          .filter((parameter): parameter is Extract<typeof parameter, { name: string }> => "name" in parameter)
          .map((parameter) => {
            const schema = parameter.schema;
            const schemaType = schema && typeof schema["type"] === "string" ? schema["type"] : undefined;
            const schemaDefault = schema ? schema["default"] : undefined;
            const schemaExample = schema ? schema["example"] : undefined;
            const rawExample = parameter.example !== undefined ? parameter.example : schemaExample;
            const rawDefault = parameter.default !== undefined ? parameter.default : schemaDefault;

            const example = (typeof rawExample === "string" || typeof rawExample === "number" || typeof rawExample === "boolean") ? rawExample : undefined;
            const defaultValue = (typeof rawDefault === "string" || typeof rawDefault === "number" || typeof rawDefault === "boolean") ? rawDefault : undefined;

            return {
              name: parameter.name,
              location: parameter.in,
              required: parameter.required ?? false,
              description: parameter.description,
              schemaType,
              example,
              default: defaultValue,
            };
          }),
        requestBody: parsedBody,
      }];
    })
  );
}

function schemasFromComponents(schemas: Record<string, Record<string, unknown>>): readonly ApiSchemaSummary[] {
  return Object.entries(schemas).map(([name, schema]) => {
    const requiredList = Array.isArray(schema["required"])
      ? schema["required"].filter((item): item is string => typeof item === "string")
      : [];
    const props = schema["properties"];
    const properties: ApiPropertyDetail[] = [];

    if (props !== null && typeof props === "object" && !Array.isArray(props)) {
      for (const [propName, propVal] of Object.entries(props)) {
        if (propVal !== null && typeof propVal === "object" && !Array.isArray(propVal)) {
          const val = propVal as Record<string, unknown>;
          properties.push({
            name: propName,
            type: typeof val["type"] === "string" ? val["type"] : "any",
            description: typeof val["description"] === "string" ? val["description"] : "",
            required: requiredList.includes(propName),
          });
        } else {
          properties.push({
            name: propName,
            type: "any",
            description: "",
            required: requiredList.includes(propName),
          });
        }
      }
    }

    return {
      name,
      type: typeof schema["type"] === "string" ? schema["type"] : "schema",
      properties,
    };
  });
}
