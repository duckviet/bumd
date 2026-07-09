import { z } from "zod";
import { WorkflowDefinitionSchema } from "../test-workflow-definition.schema.js";

export const UpdateTestWorkflowDtoSchema = z.object({
  expectedRevision: z.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/u, "Slug must be lowercase alphanumeric with dashes").optional(),
  description: z.string().max(1000).nullable().optional(),
  definitionJson: WorkflowDefinitionSchema.optional(),
});

export type UpdateTestWorkflowDto = z.infer<typeof UpdateTestWorkflowDtoSchema>;
