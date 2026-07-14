import { z } from "zod";
import type { TestWorkflowMetadata } from "./test-workflow-types.js";

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

export function workflowMetadataSnapshot(input: TestWorkflowMetadata): TestWorkflowMetadata {
  return { tags: [...input.tags], priority: input.priority, type: input.type };
}

export function parseEncryptedEnvironmentSnapshot(input: unknown): EncryptedEnvironmentSnapshot {
  return EncryptedEnvironmentSnapshotSchema.parse(input);
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
