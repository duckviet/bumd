import { z } from "zod";

export const CreateTestWorkflowRunDtoSchema = z.object({
  environmentId: z.string().optional(),
});

export type CreateTestWorkflowRunDto = z.infer<typeof CreateTestWorkflowRunDtoSchema>;
