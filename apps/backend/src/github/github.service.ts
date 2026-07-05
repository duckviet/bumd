import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Pool } from "pg";
import type {
  CreateMappingInput,
  GithubInstallationRecord,
  GithubRepoBranchMappingRecord,
  GithubRepositoryRecord,
  LinkRepositoryInput,
  PushWebhookPayload,
  PullRequestWebhookPayload,
} from "./github-types.js";

@Injectable()
export class GithubService {
  private readonly pool: Pool;

  public constructor() {
    const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  // ---------------------------------------------------------------------------
  // Signature verification
  // ---------------------------------------------------------------------------

  public verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = process.env["GITHUB_WEBHOOK_SECRET"];
    if (secret === undefined || secret.trim() === "") {
      // In development without a secret configured, skip verification
      return true;
    }
    const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    try {
      return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Installations
  // ---------------------------------------------------------------------------

  public async listInstallations(organizationId: string): Promise<GithubInstallationRecord[]> {
    const res = await this.pool.query<GithubInstallationRecord>(
      `SELECT id, "organizationId", "githubInstallationId", "accountName", "createdAt", "updatedAt"
       FROM "GithubInstallation"
       WHERE "organizationId" = $1
       ORDER BY "createdAt" DESC`,
      [organizationId],
    );
    return res.rows;
  }

  public async upsertInstallation(input: {
    readonly organizationId: string;
    readonly githubInstallationId: string;
    readonly accountName: string;
  }): Promise<GithubInstallationRecord> {
    const res = await this.pool.query<GithubInstallationRecord>(
      `INSERT INTO "GithubInstallation" (id, "organizationId", "githubInstallationId", "accountName", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
       ON CONFLICT ("githubInstallationId") DO UPDATE SET "accountName" = EXCLUDED."accountName", "updatedAt" = NOW()
       RETURNING id, "organizationId", "githubInstallationId", "accountName", "createdAt", "updatedAt"`,
      [input.organizationId, input.githubInstallationId, input.accountName],
    );
    return res.rows[0]!;
  }

  public async deleteInstallation(organizationId: string, githubInstallationId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "GithubInstallation" WHERE "organizationId" = $1 AND "githubInstallationId" = $2`,
      [organizationId, githubInstallationId],
    );
  }

  // ---------------------------------------------------------------------------
  // Repositories
  // ---------------------------------------------------------------------------

  public async listRepositories(organizationId: string): Promise<GithubRepositoryRecord[]> {
    const res = await this.pool.query<GithubRepositoryRecord>(
      `SELECT id, "organizationId", "githubInstallationId", "githubRepoId", "fullName", "docId", "createdAt", "updatedAt"
       FROM "GithubRepository"
       WHERE "organizationId" = $1
       ORDER BY "fullName" ASC`,
      [organizationId],
    );
    return res.rows;
  }

  public async linkRepository(
    organizationId: string,
    input: LinkRepositoryInput,
  ): Promise<GithubRepositoryRecord> {
    const res = await this.pool.query<GithubRepositoryRecord>(
      `INSERT INTO "GithubRepository" (id, "organizationId", "githubInstallationId", "githubRepoId", "fullName", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT ("githubRepoId") DO UPDATE SET "fullName" = EXCLUDED."fullName", "updatedAt" = NOW()
       RETURNING id, "organizationId", "githubInstallationId", "githubRepoId", "fullName", "docId", "createdAt", "updatedAt"`,
      [organizationId, input.githubInstallationId, String(input.githubRepoId), input.fullName],
    );
    return res.rows[0]!;
  }

  public async unlinkRepository(organizationId: string, repoId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "GithubRepository" WHERE "organizationId" = $1 AND id = $2`,
      [organizationId, repoId],
    );
  }

  public async findRepositoryByGithubRepoId(githubRepoId: string): Promise<GithubRepositoryRecord | null> {
    const res = await this.pool.query<GithubRepositoryRecord>(
      `SELECT id, "organizationId", "githubInstallationId", "githubRepoId", "fullName", "docId", "createdAt", "updatedAt"
       FROM "GithubRepository"
       WHERE "githubRepoId" = $1`,
      [githubRepoId],
    );
    return res.rows[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Branch Mappings
  // ---------------------------------------------------------------------------

  public async listMappings(organizationId: string, githubRepoId: string): Promise<GithubRepoBranchMappingRecord[]> {
    const res = await this.pool.query<GithubRepoBranchMappingRecord>(
      `SELECT id, "organizationId", "githubRepoId", "branchName", "specPath", "docId", "createdAt", "updatedAt"
       FROM "GithubRepoBranchMapping"
       WHERE "organizationId" = $1 AND "githubRepoId" = $2
       ORDER BY "branchName" ASC`,
      [organizationId, githubRepoId],
    );
    return res.rows;
  }

  public async createMapping(
    organizationId: string,
    githubRepoId: string,
    input: CreateMappingInput,
  ): Promise<GithubRepoBranchMappingRecord> {
    const res = await this.pool.query<GithubRepoBranchMappingRecord>(
      `INSERT INTO "GithubRepoBranchMapping" (id, "organizationId", "githubRepoId", "branchName", "specPath", "docId", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT ("githubRepoId", "branchName", "specPath") DO UPDATE SET "docId" = EXCLUDED."docId", "updatedAt" = NOW()
       RETURNING id, "organizationId", "githubRepoId", "branchName", "specPath", "docId", "createdAt", "updatedAt"`,
      [organizationId, githubRepoId, input.branchName, input.specPath, input.docId],
    );
    return res.rows[0]!;
  }

  public async deleteMapping(organizationId: string, mappingId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "GithubRepoBranchMapping" WHERE "organizationId" = $1 AND id = $2`,
      [organizationId, mappingId],
    );
  }

  public async findMappingsForBranch(
    githubRepoId: string,
    branchName: string,
  ): Promise<GithubRepoBranchMappingRecord[]> {
    const res = await this.pool.query<GithubRepoBranchMappingRecord>(
      `SELECT id, "organizationId", "githubRepoId", "branchName", "specPath", "docId", "createdAt", "updatedAt"
       FROM "GithubRepoBranchMapping"
       WHERE "githubRepoId" = $1 AND "branchName" = $2`,
      [githubRepoId, branchName],
    );
    return res.rows;
  }

  // ---------------------------------------------------------------------------
  // Push webhook processing
  // ---------------------------------------------------------------------------

  public async processPushWebhook(payload: PushWebhookPayload): Promise<{
    readonly repoFound: boolean;
    readonly mappings: readonly GithubRepoBranchMappingRecord[];
  }> {
    const githubRepoId = String(payload.repository.id);
    const repo = await this.findRepositoryByGithubRepoId(githubRepoId);
    if (repo === null) {
      return { repoFound: false, mappings: [] };
    }

    const branchName = payload.ref.replace("refs/heads/", "");
    const mappings = await this.findMappingsForBranch(githubRepoId, branchName);
    return { repoFound: true, mappings };
  }

  // ---------------------------------------------------------------------------
  // Pull request webhook processing
  // ---------------------------------------------------------------------------

  public async processPullRequestWebhook(payload: PullRequestWebhookPayload): Promise<{
    readonly repoFound: boolean;
    readonly mappings: readonly GithubRepoBranchMappingRecord[];
  }> {
    const githubRepoId = String(payload.repository.id);
    const repo = await this.findRepositoryByGithubRepoId(githubRepoId);
    if (repo === null) {
      return { repoFound: false, mappings: [] };
    }

    const headBranch = payload.pull_request.head.ref;
    const mappings = await this.findMappingsForBranch(githubRepoId, headBranch);
    return { repoFound: true, mappings };
  }
}
