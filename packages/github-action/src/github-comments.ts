import * as github from "@actions/github";
import type { ActionDiffResult } from "./diff-client.js";

const StickyMarker = "<!-- bumd-diff-comment -->";

type Octokit = ReturnType<typeof github.getOctokit>;

export type StickyCommentResult = {
  readonly commentId: number;
};

export class PullRequestContextError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export async function upsertStickyDiffComment(input: {
  readonly githubToken: string;
  readonly diff: ActionDiffResult;
}): Promise<StickyCommentResult> {
  const pullNumber = pullRequestNumber();
  const octokit = createOctokit(input.githubToken);
  const { owner, repo } = github.context.repo;
  const body = renderCommentBody(input.diff);
  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
  });
  const existing = comments.data.find((comment) => comment.body?.includes(StickyMarker) === true);
  if (existing !== undefined) {
    const updated = await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return { commentId: updated.data.id };
  }
  const created = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body,
  });
  return { commentId: created.data.id };
}

function createOctokit(token: string): Octokit {
  const baseUrl = process.env["GITHUB_API_URL"];
  if (baseUrl === undefined || baseUrl.trim() === "") {
    return github.getOctokit(token);
  }
  return github.getOctokit(token, { baseUrl });
}

function pullRequestNumber(): number {
  const pullRequest = github.context.payload.pull_request;
  if (pullRequest === undefined) {
    throw new PullRequestContextError("Diff comments require a pull_request event payload");
  }
  const number = pullRequest.number;
  if (typeof number !== "number") {
    throw new PullRequestContextError("Pull request payload is missing its number");
  }
  return number;
}

function renderCommentBody(diff: ActionDiffResult): string {
  return `${StickyMarker}
## Bumd API Diff

${diff.markdown}

Classification: ${diff.classification}
Breaking changes: ${diff.hasBreaking ? "yes" : "no"}`;
}
