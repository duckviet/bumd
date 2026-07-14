import { z } from "zod";
import {
  WorkflowDefinitionSchema,
  WorkflowMetadataSchema,
  WorkflowTagsSchema,
} from "../test-workflow-definition.schema.js";

export const CreateTestWorkflowDtoSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/u, "Slug must be lowercase alphanumeric with dashes").optional(),
  description: z.string().max(1000).optional(),
  tags: WorkflowTagsSchema.default([]),
  priority: WorkflowMetadataSchema.shape.priority.default("medium"),
  type: WorkflowMetadataSchema.shape.type.default("integration"),
  definitionJson: WorkflowDefinitionSchema.optional(),
});

export type CreateTestWorkflowDto = z.infer<typeof CreateTestWorkflowDtoSchema>;
