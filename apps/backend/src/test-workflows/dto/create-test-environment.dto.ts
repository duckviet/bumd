import { z } from "zod";

const VariableInputSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string(),
  secret: z.boolean().optional(),
});

export const CreateTestEnvironmentDtoSchema = z.object({
  name: z.string().min(1).max(200),
  isDefault: z.boolean().optional(),
  variables: z.array(VariableInputSchema).optional(),
});

export type CreateTestEnvironmentDto = z.infer<typeof CreateTestEnvironmentDtoSchema>;
