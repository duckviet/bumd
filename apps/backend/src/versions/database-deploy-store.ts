import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { DeployStore } from "./deploy-ports.js";
import {
  VersionStatus,
  type DeployJobRecord,
  type DiffClassification,
  type PersistedDiffRecord,
  type SourceFormat,
  type VersionRecord,
} from "./deploy-types.js";
import type { ObjectStore } from "../storage/object-store-port.js";

type VersionRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly sequenceNumber: number;
  readonly sha256: string;
  readonly sourceFormat: string;
  readonly rawSpecObjectKey: string;
  readonly status: string;
  readonly createdByTokenId: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly readyAt: Date | null;
};

type DiffRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly baseVersionId: string | null;
  readonly headVersionId: string;
  readonly classification: string;
  readonly has_breaking: boolean;
  readonly diff_json: unknown;
  readonly diff_markdown: string;
};

export class DatabaseDeployStore implements DeployStore {
  private readonly pool: Pool;

  public constructor(
    databaseUrl: string,
    private readonly objectStore: ObjectStore,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  public async findVersionByHash(input: {
    readonly orgSlug: string;
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly sha256: string;
  }): Promise<VersionRecord | null> {
    const result = await this.pool.query<VersionRow>(
      `
        SELECT v.id, v."organizationId", v."docId", v."branchId", v."sequenceNumber", 
               v.sha256, v."sourceFormat", v."rawSpecObjectKey", 
               v.status, v."createdByTokenId", v."createdByUserId", v."createdAt", v."readyAt"
        FROM "Version" v
        JOIN "Organization" o ON o.id = v."organizationId"
        JOIN "Doc" d ON d.id = v."docId"
        JOIN "Branch" b ON b.id = v."branchId"
        WHERE o.slug = $1 AND d.slug = $2 AND b.slug = $3 AND v.sha256 = $4
        LIMIT 1
      `,
      [input.orgSlug, input.docSlug, input.branchSlug, input.sha256],
    );
    const row = result.rows[0];
    return row !== undefined ? mapVersionRow(row) : null;
  }

  public async createQueuedVersion(input: {
    readonly orgSlug: string;
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly sha256: string;
    readonly sourceFormat: SourceFormat;
    readonly rawSpec: string;
    readonly createdByTokenId: string | null;
    readonly createdByUserId?: string | null;
  }): Promise<{ readonly version: VersionRecord; readonly job: DeployJobRecord }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Resolve Org ID
      const orgResult = await client.query<{ readonly id: string }>(
        'SELECT id FROM "Organization" WHERE slug = $1 OR id = $1',
        [input.orgSlug],
      );
      const orgRow = orgResult.rows[0];
      if (orgRow === undefined) {
        throw new Error("organization_not_found");
      }
      const orgId = orgRow.id;

      // Resolve Doc ID
      const docResult = await client.query<{ readonly id: string }>(
        'SELECT id FROM "Doc" WHERE "organizationId" = $1 AND (slug = $2 OR id = $2)',
        [orgId, input.docSlug],
      );
      const docRow = docResult.rows[0];
      if (docRow === undefined) {
        throw new Error("doc_not_found");
      }
      const docId = docRow.id;

      // Find Branch ID
      const branchResult = await client.query<{ readonly id: string }>(
        'SELECT id FROM "Branch" WHERE "docId" = $1 AND (slug = $2 OR name = $2)',
        [docId, input.branchSlug],
      );
      let branchId = branchResult.rows[0]?.id ?? null;

      if (branchId === null) {
        branchId = `br_${input.branchSlug}_${randomUUID().slice(0, 8)}`;
        await client.query(
          'INSERT INTO "Branch" (id, "organizationId", "docId", name, slug, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
          [branchId, orgId, docId, input.branchSlug, input.branchSlug],
        );
        // Set default branch on Doc if it is currently null
        await client.query(
          'UPDATE "Doc" SET "defaultBranchId" = $1 WHERE id = $2 AND "defaultBranchId" IS NULL',
          [branchId, docId],
        );
      }

      // Lock Branch to allocate sequence number safely
      await client.query('SELECT id FROM "Branch" WHERE id = $1 FOR UPDATE', [branchId]);

      const seqResult = await client.query<{ readonly max_seq: number }>(
        'SELECT COALESCE(MAX("sequenceNumber"), 0) AS max_seq FROM "Version" WHERE "branchId" = $1',
        [branchId],
      );
      const nextSeq = (seqResult.rows[0]?.max_seq ?? 0) + 1;

      const versionId = `ver_${input.docSlug}_${randomUUID().slice(0, 8)}`;
      const objectKey = `specs/${input.sha256}`;
      
      await client.query(
        'INSERT INTO "Version" (id, "organizationId", "docId", "branchId", "sequenceNumber", sha256, "sourceFormat", "rawSpecObjectKey", status, "validationSummary", "createdByTokenId", "createdByUserId", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())',
        [versionId, orgId, docId, branchId, nextSeq, input.sha256, input.sourceFormat, objectKey, "queued", '{}', input.createdByTokenId || null, input.createdByUserId || null],
      );

      const jobId = `job_${versionId}`;
      await client.query(
        'INSERT INTO "ProcessingJob" (id, "organizationId", "docId", "branchId", "versionId", "jobKey", type, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())',
        [jobId, orgId, docId, branchId, versionId, `version:${versionId}:parse`, "parse", "queued"],
      );

      await this.objectStore.put(objectKey, input.rawSpec);

      const versionResult = await client.query<VersionRow>(
        `
          SELECT id, "organizationId", "docId", "branchId", "sequenceNumber", 
                 sha256, "sourceFormat", "rawSpecObjectKey", 
                 status, "createdByTokenId", "createdByUserId", "createdAt", "readyAt"
          FROM "Version" WHERE id = $1
        `,
        [versionId],
      );
      const versionRow = versionResult.rows[0];
      if (versionRow === undefined) {
        throw new Error("failed_to_retrieve_created_version");
      }

      await client.query("COMMIT");

      const version = mapVersionRow(versionRow);
      const job: DeployJobRecord = {
        id: jobId,
        versionId,
        jobKey: `version:${versionId}:parse`,
        status: "queued",
      };

      return { version, job };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async getVersion(versionId: string): Promise<VersionRecord> {
    const result = await this.pool.query<VersionRow>(
      `
        SELECT id, "organizationId", "docId", "branchId", "sequenceNumber", 
               sha256, "sourceFormat", "rawSpecObjectKey", 
               status, "createdByTokenId", "createdByUserId", "createdAt", "readyAt"
        FROM "Version" WHERE id = $1
      `,
      [versionId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("version_not_found");
    }
    return mapVersionRow(row);
  }

  public async getRawSpec(versionId: string): Promise<string> {
    const version = await this.getVersion(versionId);
    return this.objectStore.get(version.rawSpecObjectKey);
  }

  public async previousReadyVersion(version: VersionRecord): Promise<VersionRecord | null> {
    const result = await this.pool.query<VersionRow>(
      `
        SELECT id, "organizationId", "docId", "branchId", "sequenceNumber", 
               sha256, "sourceFormat", "rawSpecObjectKey", 
               status, "createdByTokenId", "createdByUserId", "createdAt", "readyAt"
        FROM "Version"
        WHERE "branchId" = $1 AND "sequenceNumber" < $2 AND status = 'ready'
        ORDER BY "sequenceNumber" DESC
        LIMIT 1
      `,
      [version.branchId, version.sequenceNumber],
    );
    const row = result.rows[0];
    return row !== undefined ? mapVersionRow(row) : null;
  }

  public async markVersionProcessing(versionId: string): Promise<VersionRecord> {
    await this.pool.query('UPDATE "Version" SET status = \'processing\' WHERE id = $1', [versionId]);
    await this.pool.query('UPDATE "ProcessingJob" SET status = \'processing\', "updatedAt" = NOW() WHERE "versionId" = $1', [versionId]);
    return this.getVersion(versionId);
  }

  public async markVersionReady(versionId: string): Promise<VersionRecord> {
    await this.pool.query('UPDATE "Version" SET status = \'ready\', "readyAt" = NOW() WHERE id = $1', [versionId]);
    return this.getVersion(versionId);
  }

  public async markVersionFailed(versionId: string, error?: unknown): Promise<VersionRecord> {
    await this.pool.query('UPDATE "Version" SET status = \'failed\' WHERE id = $1', [versionId]);
    const errorData = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error !== undefined
      ? { message: String(error) }
      : null;
    const errorJson = errorData !== null ? JSON.stringify(errorData) : null;
    await this.pool.query(
      'UPDATE "ProcessingJob" SET status = \'failed\', error = $2, "updatedAt" = NOW() WHERE "versionId" = $1',
      [versionId, errorJson],
    );
    return this.getVersion(versionId);
  }

  public async recordArtifact(input: {
    readonly versionId: string;
    readonly kind: "normalized_spec";
    readonly contentSha256: string;
  }): Promise<void> {
    const version = await this.getVersion(input.versionId);
    const id = `art_${randomUUID().slice(0, 8)}`;
    await this.pool.query(
      'INSERT INTO "VersionArtifact" (id, "organizationId", "versionId", kind, "objectKey", "contentSha256", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [id, version.organizationId, version.id, input.kind, `normalized/${version.id}.json`, input.contentSha256],
    );
  }

  public async recordDiff(input: {
    readonly versionId: string;
    readonly baseVersionId: string | null;
    readonly classification: DiffClassification;
    readonly hasBreaking: boolean;
    readonly diffJson: unknown;
    readonly diffMarkdown: string;
  }): Promise<void> {
    const version = await this.getVersion(input.versionId);
    const id = `diff_${randomUUID().slice(0, 8)}`;
    await this.pool.query(
      'INSERT INTO "Diff" (id, "organizationId", "docId", "branchId", "baseVersionId", "headVersionId", classification, has_breaking, diff_json, diff_markdown, summary, changes, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())',
      [
        id,
        version.organizationId,
        version.docId,
        version.branchId,
        input.baseVersionId,
        input.versionId,
        input.classification,
        input.hasBreaking,
        JSON.stringify(input.diffJson),
        input.diffMarkdown,
        '{}',
        '[]',
      ],
    );
  }

  public async diffForVersion(versionId: string): Promise<PersistedDiffRecord | null> {
    return this.diffForVersionAsync(versionId);
  }

  public async diffForVersionAsync(versionId: string): Promise<PersistedDiffRecord | null> {
    const result = await this.pool.query<DiffRow>(
      'SELECT id, classification, has_breaking AS "hasBreaking", diff_json AS "diffJson", diff_markdown AS "diffMarkdown" FROM "Diff" WHERE "headVersionId" = $1 LIMIT 1',
      [versionId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      versionId,
      baseVersionId: row.baseVersionId,
      classification: row.classification as DiffClassification,
      hasBreaking: row.has_breaking,
      diffJson: row.diff_json,
      diffMarkdown: row.diff_markdown,
    };
  }

  public async markJobCompleted(versionId: string): Promise<void> {
    await this.pool.query('UPDATE "ProcessingJob" SET status = \'completed\', "updatedAt" = NOW() WHERE "versionId" = $1', [versionId]);
  }

  public deployJobCount(): number {
    return 0;
  }

  private async resolveOrgId(orgSlug: string): Promise<string> {
    const result = await this.pool.query<{ readonly id: string }>(
      'SELECT id FROM "Organization" WHERE slug = $1 OR id = $1',
      [orgSlug],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("organization_not_found");
    }
    return row.id;
  }

  private async resolveDocId(orgId: string, docSlug: string): Promise<string> {
    const result = await this.pool.query<{ readonly id: string }>(
      'SELECT id FROM "Doc" WHERE "organizationId" = $1 AND (slug = $2 OR id = $2)',
      [orgId, docSlug],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("doc_not_found");
    }
    return row.id;
  }

  private async findBranchId(docId: string, branchSlug: string): Promise<string | null> {
    const result = await this.pool.query<{ readonly id: string }>(
      'SELECT id FROM "Branch" WHERE "docId" = $1 AND (slug = $2 OR name = $2)',
      [docId, branchSlug],
    );
    const row = result.rows[0];
    return row !== undefined ? row.id : null;
  }
}

export function createDeployStore(inMemoryStore: DeployStore, objectStore: ObjectStore): DeployStore {
  const databaseUrl = process.env["DATABASE_URL"];
  if (process.env["DEPLOY_STORE"] === "memory" || databaseUrl === undefined || databaseUrl.trim() === "") {
    return inMemoryStore;
  }
  return new DatabaseDeployStore(databaseUrl, objectStore);
}

function mapVersionRow(row: VersionRow): VersionRecord {
  const baseRecord = {
    id: row.id,
    organizationId: row.organizationId,
    docId: row.docId,
    branchId: row.branchId,
    sequenceNumber: row.sequenceNumber,
    sha256: row.sha256,
    sourceFormat: row.sourceFormat as SourceFormat,
    rawSpecObjectKey: row.rawSpecObjectKey,
    status: row.status as VersionStatus,
    createdByTokenId: row.createdByTokenId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };

  if (row.readyAt !== null && row.readyAt !== undefined) {
    return {
      ...baseRecord,
      readyAt: row.readyAt.toISOString(),
    };
  }
  return baseRecord;
}
