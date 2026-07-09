import { ZodError } from "zod";
import { ActionCommand, readActionInputs } from "./action-inputs.js";
import { runDeployMode } from "./deploy-mode.js";
import { runDiffMode } from "./diff-mode.js";
import { resolveBackendToken } from "./oidc-token.js";

export async function runAction(): Promise<void> {
  const inputs = await resolveBackendToken(readActionInputs());
  switch (inputs.command) {
    case ActionCommand.Deploy:
      await runDeployMode(inputs);
      return;
    case ActionCommand.Diff:
      await runDiffMode(inputs);
      return;
  }
}

export function formatActionError(error: unknown): string {
  if (error instanceof ZodError) {
    return "Action inputs did not match the expected schema";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Action failed";
}
