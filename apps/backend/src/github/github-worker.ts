import { Injectable, Inject } from "@nestjs/common";
import { DEPLOY_STORE, DEPLOY_QUEUE, type DeployStore, type DeployQueue } from "../versions/deploy-ports.js";
import { hashText } from "../versions/in-memory-deploy-store.js";
import { ApiTokenRole, ApiTokenScope } from "../auth/auth-types.js";
import type { GithubJobData, PushWebhookPayload, PullRequestWebhookPayload } from "./github-types.js";
import { GithubService } from "./github.service.js";

@Injectable()
export class GithubWorker {
  public constructor(
    private readonly githubService: GithubService,
    @Inject(DEPLOY_STORE) private readonly deployStore: DeployStore,
    @Inject(DEPLOY_QUEUE) private readonly deployQueue: DeployQueue,
  ) {}

  public async process(data: GithubJobData): Promise<void> {
    if (data.type === "push") {
      await this.processPush(data.payload);
    } else if (data.type === "pull_request") {
      await this.processPullRequest(data.payload);
    }
  }

  private async processPush(payload: PushWebhookPayload): Promise<void> {
    const { repoFound, mappings } = await this.githubService.processPushWebhook(payload);
    if (!repoFound || mappings.length === 0) {
      return;
    }

    const branchName = payload.ref.replace("refs/heads/", "");
    for (const mapping of mappings) {
      try {
        // Fetch spec content from GitHub API (stub - in production, use GitHub App token + octokit)
        const spec = await fetchSpecFromGithub({
          fullName: payload.repository.full_name,
          specPath: mapping.specPath,
          ref: payload.after,
        });
        if (spec === null) {
          continue;
        }

        const sha256 = hashText(spec);
        const existing = await this.deployStore.findVersionByHash({
          orgSlug: mapping.organizationId,
          docSlug: mapping.docId,
          branchSlug: branchName,
          sha256,
        });
        if (existing !== null) {
          continue;
        }

        const created = await this.deployStore.createQueuedVersion({
          orgSlug: mapping.organizationId,
          docSlug: mapping.docId,
          branchSlug: branchName,
          sha256,
          sourceFormat: "openapi",
          rawSpec: spec,
          createdByTokenId: "github-push",
        });
        await this.deployQueue.enqueueDeploy({ versionId: created.version.id });
      } catch (error) {
        console.error(`[GithubWorker] push processing error for mapping ${mapping.id}:`, error);
      }
    }
  }

  private async processPullRequest(payload: PullRequestWebhookPayload): Promise<void> {
    const { repoFound, mappings } = await this.githubService.processPullRequestWebhook(payload);
    if (!repoFound || mappings.length === 0) {
      return;
    }

    const headRef = payload.pull_request.head.ref;
    const headSha = payload.pull_request.head.sha;

    for (const mapping of mappings) {
      try {
        // Fetch spec content from GitHub API (stub)
        const spec = await fetchSpecFromGithub({
          fullName: payload.repository.full_name,
          specPath: mapping.specPath,
          ref: headSha,
        });
        if (spec === null) {
          continue;
        }

        const sha256 = hashText(spec);
        const existing = await this.deployStore.findVersionByHash({
          orgSlug: mapping.organizationId,
          docSlug: mapping.docId,
          branchSlug: `pr-${payload.number}`,
          sha256,
        });
        if (existing !== null) {
          continue;
        }

        const created = await this.deployStore.createQueuedVersion({
          orgSlug: mapping.organizationId,
          docSlug: mapping.docId,
          branchSlug: `pr-${payload.number}`,
          sha256,
          sourceFormat: "openapi",
          rawSpec: spec,
          createdByTokenId: "github-pr",
        });
        await this.deployQueue.enqueueDeploy({ versionId: created.version.id });
      } catch (error) {
        console.error(`[GithubWorker] PR processing error for mapping ${mapping.id}:`, error);
      }
    }
  }
}

async function fetchSpecFromGithub(input: {
  readonly fullName: string;
  readonly specPath: string;
  readonly ref: string;
}): Promise<string | null> {
  const githubToken = process.env["GITHUB_APP_TOKEN"];
  if (githubToken === undefined || githubToken.trim() === "") {
    // In development/testing without GitHub App token configured
    return null;
  }

  try {
    const url = `https://api.github.com/repos/${input.fullName}/contents/${input.specPath}?ref=${input.ref}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });
    if (!response.ok) {
      return null;
    }
    return response.text();
  } catch {
    return null;
  }
}
