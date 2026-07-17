import { z } from "zod";
import type { TestWorkflowMetadata, TestWorkflowNodePhase } from "./test-workflow-types.js";

const EncryptedEnvironmentVariableSnapshotSchema = z.object({
  id: z.string(),
  key: z.string(),
  encryptedValue: z.string().nullable(),
  secret: z.boolean(),
});

export const EncryptedEnvironmentSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  variables: z.array(EncryptedEnvironmentVariableSnapshotSchema),
});

export type EncryptedEnvironmentSnapshot = z.infer<typeof EncryptedEnvironmentSnapshotSchema>;

export type EnvironmentSnapshotDescriptor = {
  readonly id: string;
  readonly name: string;
  readonly variables: readonly {
    readonly id: string;
    readonly key: string;
    readonly secret: boolean;
    readonly hasValue: boolean;
  }[];
};

export type SanitizedStepInput =
  | { readonly type: "env"; readonly key: string; readonly value: unknown }
  | { readonly type: "data"; readonly key: string; readonly value: unknown }
  | { readonly type: "var"; readonly name: string; readonly value: unknown };

export function workflowMetadataSnapshot(input: TestWorkflowMetadata): TestWorkflowMetadata {
  return { tags: [...input.tags], priority: input.priority, type: input.type };
}

export function parseEncryptedEnvironmentSnapshot(input: unknown): EncryptedEnvironmentSnapshot {
  return EncryptedEnvironmentSnapshotSchema.parse(input);
}

export function parseStepPhase(input: unknown): TestWorkflowNodePhase {
  return z.enum(["setup", "test", "teardown"]).parse(input);
}

export function sanitizeEnvironmentSnapshot(
  snapshot: EncryptedEnvironmentSnapshot,
): EnvironmentSnapshotDescriptor {
  return {
    id: snapshot.id,
    name: snapshot.name,
    variables: snapshot.variables.map((variable) => ({
      id: variable.id,
      key: variable.key,
      secret: variable.secret,
      hasValue: variable.encryptedValue !== null,
    })),
  };
}

export function sanitizeStepInputs(
  input: unknown,
  secretEnvironmentKeys: ReadonlySet<string> | null,
): readonly SanitizedStepInput[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((candidate): readonly SanitizedStepInput[] => {
    if (!isRecord(candidate) || !("value" in candidate)) return [];
    if (candidate["type"] === "env" && typeof candidate["key"] === "string") {
      const secret = secretEnvironmentKeys === null || secretEnvironmentKeys.has(candidate["key"]);
      return [{ type: "env", key: candidate["key"], value: secret ? "[REDACTED]" : candidate["value"] }];
    }
    if (candidate["type"] === "data" && typeof candidate["key"] === "string") {
      return [{ type: "data", key: candidate["key"], value: candidate["value"] }];
    }
    if (candidate["type"] === "var" && typeof candidate["name"] === "string") {
      return [{ type: "var", name: candidate["name"], value: candidate["value"] }];
    }
    return [];
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
