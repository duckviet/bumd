import { z } from "zod";

const VariableUpdateSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string().optional(),
  secret: z.boolean().optional(),
  remove: z.boolean().optional(),
});

export const UpdateTestEnvironmentDtoSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isDefault: z.boolean().optional(),
  variables: z.array(VariableUpdateSchema).optional(),
});

export type UpdateTestEnvironmentDto = z.infer<typeof UpdateTestEnvironmentDtoSchema>;
