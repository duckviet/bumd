import { readRecord, readString, type UnknownRecord } from "./record.js";
import { parseSpec } from "./spec-parser.js";
import { DiffChangeKind, DiffEngineClassification, type DiffChange } from "./types.js";

const HttpMethods = ["get", "put", "post", "delete", "patch", "options", "head", "trace"] as const;

export function classifyOpenApiSpecs(baseSpec: string, revisionSpec: string): readonly DiffChange[] {
  const base = parseSpec(baseSpec);
  const revision = parseSpec(revisionSpec);
  const basePaths = readRecord(base, "paths") ?? {};
  const revisionPaths = readRecord(revision, "paths") ?? {};
  return [
    ...endpointChanges(basePaths, revisionPaths),
    ...requiredParameterChanges(basePaths, revisionPaths),
    ...responseSchemaChanges(basePaths, revisionPaths),
  ];
}

export function classificationFor(changes: readonly DiffChange[]): DiffEngineClassification {
  if (changes.some((change) => change.severity === DiffEngineClassification.Breaking)) {
    return DiffEngineClassification.Breaking;
  }
  if (changes.some((change) => change.severity === DiffEngineClassification.Warning)) {
    return DiffEngineClassification.Warning;
  }
  return DiffEngineClassification.NonBreaking;
}

function endpointChanges(basePaths: UnknownRecord, revisionPaths: UnknownRecord): readonly DiffChange[] {
  const changes: DiffChange[] = [];
  for (const [path, pathValue] of Object.entries(basePaths)) {
    const basePath = readPath(pathValue);
    const revisionPath = readPath(revisionPaths[path]);
    for (const method of Object.keys(basePath)) {
      if (revisionPath[method] === undefined) {
        changes.push({
          kind: DiffChangeKind.RemovedEndpoint,
          path,
          method,
          severity: DiffEngineClassification.Breaking,
          message: `${method.toUpperCase()} ${path} was removed`,
        });
      }
    }
  }
  for (const [path, pathValue] of Object.entries(revisionPaths)) {
    const basePath = readPath(basePaths[path]);
    const revisionPath = readPath(pathValue);
    for (const method of Object.keys(revisionPath)) {
      if (basePath[method] === undefined) {
        changes.push({
          kind: DiffChangeKind.AddedEndpoint,
          path,
          method,
          severity: DiffEngineClassification.NonBreaking,
          message: `${method.toUpperCase()} ${path} was added`,
        });
      }
    }
  }
  return changes;
}

function requiredParameterChanges(basePaths: UnknownRecord, revisionPaths: UnknownRecord): readonly DiffChange[] {
  const changes: DiffChange[] = [];
  for (const [path, pathValue] of Object.entries(revisionPaths)) {
    const basePath = readPath(basePaths[path]);
    const revisionPath = readPath(pathValue);
    for (const [method, operation] of Object.entries(revisionPath)) {
      const baseParameters = parameterKeys(basePath[method]);
      for (const parameter of requiredParameters(operation)) {
        if (!baseParameters.has(parameter)) {
          changes.push({
            kind: DiffChangeKind.AddedRequiredParameter,
            path,
            method,
            location: parameter,
            severity: DiffEngineClassification.Breaking,
            message: `${method.toUpperCase()} ${path} added required parameter ${parameter}`,
          });
        }
      }
    }
  }
  return changes;
}

function responseSchemaChanges(basePaths: UnknownRecord, revisionPaths: UnknownRecord): readonly DiffChange[] {
  const changes: DiffChange[] = [];
  for (const [path, pathValue] of Object.entries(revisionPaths)) {
    const basePath = readPath(basePaths[path]);
    const revisionPath = readPath(pathValue);
    for (const [method, revisionOperation] of Object.entries(revisionPath)) {
      const baseProperties = responseProperties(basePath[method]);
      const revisionProperties = responseProperties(revisionOperation);
      for (const [name, revisionProperty] of Object.entries(revisionProperties)) {
        const baseProperty = baseProperties[name];
        if (baseProperty === undefined) {
          changes.push({
            kind: DiffChangeKind.AddedOptionalField,
            path,
            method,
            location: name,
            severity: DiffEngineClassification.NonBreaking,
            message: `${method.toUpperCase()} ${path} added optional response field ${name}`,
          });
          continue;
        }
        const baseType = readString(baseProperty, "type");
        const revisionType = readString(revisionProperty, "type");
        if (baseType !== null && revisionType !== null && baseType !== revisionType) {
          changes.push({
            kind: DiffChangeKind.ResponseTypeChanged,
            path,
            method,
            location: name,
            severity: DiffEngineClassification.Breaking,
            message: `${method.toUpperCase()} ${path} changed response field ${name} from ${baseType} to ${revisionType}`,
          });
        }
      }
    }
  }
  return changes;
}

function readPath(value: unknown): UnknownRecord {
  if (!isOperationContainer(value)) {
    return {};
  }
  const operations: Record<string, unknown> = {};
  for (const method of HttpMethods) {
    const operation = value[method];
    if (operation !== undefined) {
      operations[method] = operation;
    }
  }
  return operations;
}

function isOperationContainer(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredParameters(operation: unknown): readonly string[] {
  const parameters = isOperationContainer(operation) ? operation["parameters"] : undefined;
  if (!Array.isArray(parameters)) {
    return [];
  }
  return parameters.flatMap((parameter) => {
    if (!isOperationContainer(parameter) || parameter["required"] !== true) {
      return [];
    }
    const name = typeof parameter["name"] === "string" ? parameter["name"] : null;
    const location = typeof parameter["in"] === "string" ? parameter["in"] : null;
    return name === null || location === null ? [] : [`${location}:${name}`];
  });
}

function parameterKeys(operation: unknown): ReadonlySet<string> {
  return new Set(requiredParameters(operation));
}

function responseProperties(operation: unknown): UnknownRecord {
  const responses = readRecord(operation, "responses");
  const okResponse = responses === null ? null : readRecord(responses, "200");
  const content = okResponse === null ? null : readRecord(okResponse, "content");
  const json = content === null ? null : readRecord(content, "application/json");
  const schema = json === null ? null : readRecord(json, "schema");
  return schema === null ? {} : (readRecord(schema, "properties") ?? {});
}
