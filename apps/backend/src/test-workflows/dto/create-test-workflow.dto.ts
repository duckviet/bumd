import { z } from "zod";
import { WorkflowDefinitionSchema } from "../test-workflow-definition.schema.js";

export const CreateTestWorkflowDtoSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/u, "Slug must be lowercase alphanumeric with dashes").optional(),
  description: z.string().max(1000).optional(),
  definitionJson: WorkflowDefinitionSchema.optional(),
});

export type CreateTestWorkflowDto = z.infer<typeof CreateTestWorkflowDtoSchema>;
