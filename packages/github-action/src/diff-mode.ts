import * as core from "@actions/core";
import type { AuthenticatedActionInputs } from "./oidc-token.js";
import { fetchDiffResult } from "./diff-client.js";
import { upsertStickyDiffComment } from "./github-comments.js";

export class ActionConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export async function runDiffMode(inputs: AuthenticatedActionInputs): Promise<void> {
  const diff = await fetchDiffResult(inputs);
  core.setOutput("classification", diff.classification);
  core.setOutput("has_breaking", String(diff.hasBreaking));

  if (inputs.stickyComment) {
    if (inputs.githubToken === undefined) {
      throw new ActionConfigurationError("github_token is required when sticky_comment is true");
    }
    const comment = await upsertStickyDiffComment({
      githubToken: inputs.githubToken,
      diff,
    });
    core.setOutput("comment_id", String(comment.commentId));
  }

  if (inputs.failOnBreaking && diff.hasBreaking) {
    core.setFailed("Breaking API changes detected");
  }
}
