import { Injectable, Inject } from "@nestjs/common";
import { DEPLOY_STORE, DEPLOY_QUEUE, type DeployStore, type DeployQueue } from "../versions/deploy-ports.js";
import { hashText } from "../versions/in-memory-deploy-store.js";
import { ApiTokenRole, ApiTokenScope } from "../auth/auth-types.js";
import type { GithubJobData, PushWebhookPayload, PullRequestWebhookPayload } from "./github-types.js";
import { GithubService } from "./github.service.js";
import { createSign } from "node:crypto";

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
          installationId: payload.installation?.id,
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
          createdByTokenId: "",
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
          installationId: payload.installation?.id,
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
          createdByTokenId: "",
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
  readonly installationId?: number | undefined;
}): Promise<string | null> {
  let githubToken = process.env["GITHUB_APP_TOKEN"] || process.env["GITHUB_TOKEN"];

  const appId = process.env["GITHUB_APP_ID"];
  const privateKey = process.env["GITHUB_APP_PRIVATE_KEY"];

  if (appId && privateKey && input.installationId) {
    try {
      githubToken = await getInstallationAccessToken(appId, privateKey, String(input.installationId));
    } catch (error) {
      console.error(`Failed to get installation access token for installation ${input.installationId}:`, error);
    }
  }

  try {
    const url = `https://api.github.com/repos/${input.fullName}/contents/${input.specPath}?ref=${input.ref}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3.raw",
      "User-Agent": "bumd-dev-agent",
    };
    if (githubToken && githubToken.trim() !== "") {
      headers["Authorization"] = `Bearer ${githubToken}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return null;
    }
    return response.text();
  } catch {
    return null;
  }
}

function generateGithubAppJwt(appId: string, privateKeyPem: string): string {
  const cleanKey = privateKeyPem.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const tokenInput = `${headerB64}.${payloadB64}`;

  const signer = createSign("RSA-SHA256");
  signer.update(tokenInput);
  const signatureB64 = signer.sign(cleanKey, "base64url");

  return `${tokenInput}.${signatureB64}`;
}

async function getInstallationAccessToken(
  appId: string,
  privateKeyPem: string,
  installationId: string
): Promise<string> {
  const jwt = generateGithubAppJwt(appId, privateKeyPem);
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bumd-backend",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to generate installation token: ${await response.text()}`);
  }
  const data = (await response.json()) as { token: string };
  return data.token;
}
