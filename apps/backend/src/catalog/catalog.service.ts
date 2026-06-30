import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { CatalogError } from "./catalog-errors.js";
import type {
  ChangeSummaryResponse,
  CreateWebhookResponse,
  DiffDetailResponse,
  LatestReadyVersionResponse,
  PortalDocResponse,
  VersionDiffResponse,
  VersionReadResponse,
  WebhookResponse,
} from "./catalog-types.js";
import { OBJECT_STORE, type ObjectStore } from "../storage/object-store-port.js";

type DocRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly visibility: string;
};

type BranchRow = {
  readonly id: string;
  readonly slug: string;
};

type VersionRow = {
  readonly id: string;
  readonly sha256: string;
  readonly status: string;
  readonly sequenceNumber: number;
  readonly rawSpecObjectKey: string;
  readonly createdAt: Date;
  readonly readyAt: Date | null;
};

type DiffRow = {
  readonly id: string;
  readonly classification: string;
  readonly summaryMarkdown: string | null;
  readonly diffJson: unknown;
  readonly createdAt: Date;
};

type WebhookRow = {
  readonly id: string;
  readonly url: string;
  readonly description: string | null;
  readonly eventTypes: readonly string[];
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

const createWebhookSchema = z.object({
  url: z.string().url(),
  description: z.string().trim().max(200).optional(),
  eventTypes: z.array(z.string().min(1)).min(1),
});

@Injectable()
export class CatalogService implements OnModuleDestroy {
  private pool: Pool | null = null;
  private readonly logger = new Logger(CatalogService.name);

  public constructor(@Inject(OBJECT_STORE) private readonly objectStore: ObjectStore) {}

  public async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  public async portalDoc(orgSlug: string, docSlug: string): Promise<PortalDocResponse> {
    const doc = await this.findDoc(orgSlug, docSlug);
    const branch = await this.defaultBranch(doc.id);
    return {
      slug: doc.slug,
      name: doc.name,
      visibility: doc.visibility,
      defaultBranchSlug: branch.slug,
    };
  }

  public async latestReadyVersion(orgSlug: string, docSlug: string, branchSlug: string): Promise<LatestReadyVersionResponse> {
    const doc = await this.findDoc(orgSlug, docSlug);
    const branch = await this.findBranch(doc.id, branchSlug);
    const version = await this.latestReadyVersionRow(branch.id);
    return {
      id: version.id,
      branchSlug: branch.slug,
      sequenceNumber: version.sequenceNumber,
      readyAt: (version.readyAt ?? version.createdAt).toISOString(),
      spec: await this.fetchSpec(version.rawSpecObjectKey),
    };
  }

  public async version(orgSlug: string, docSlug: string, branchSlug: string, versionId: string): Promise<VersionReadResponse> {
    const doc = await this.findDoc(orgSlug, docSlug);
    const branch = await this.findBranch(doc.id, branchSlug);
    const version = await this.versionRow(branch.id, versionId);
    return {
      id: version.id,
      sha256: version.sha256,
      status: version.status,
      createdAt: version.createdAt.toISOString(),
      readyAt: version.readyAt?.toISOString() ?? null,
    };
  }

  public async changes(orgSlug: string, docSlug: string): Promise<readonly ChangeSummaryResponse[]> {
    const doc = await this.findDoc(orgSlug, docSlug);
    const result = await this.database().query<DiffRow>(
      `
        SELECT id, classification, "summaryMarkdown", "diffJson", "createdAt"
        FROM "Diff"
        WHERE "organizationId" = $1 AND "docId" = $2
        ORDER BY "createdAt" DESC
      `,
      [doc.organizationId, doc.id],
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: this.diffTitle(row),
      createdAt: row.createdAt.toISOString(),
      hasBreaking: row.classification === "breaking",
    }));
  }

  public async changeDetail(orgSlug: string, docSlug: string, diffId: string): Promise<DiffDetailResponse> {
    const doc = await this.findDoc(orgSlug, docSlug);
    const diff = await this.diffRow(doc.organizationId, doc.id, diffId);
    return {
      id: diff.id,
      diffMarkdown: this.diffMarkdown(diff),
    };
  }

  public async versionDiff(orgSlug: string, docSlug: string, branchSlug: string, versionId: string): Promise<VersionDiffResponse> {
    const doc = await this.findDoc(orgSlug, docSlug);
    const branch = await this.findBranch(doc.id, branchSlug);
    await this.versionRow(branch.id, versionId);
    const result = await this.database().query<DiffRow>(
      `
        SELECT id, classification, "summaryMarkdown", "diffJson", "createdAt"
        FROM "Diff"
        WHERE "organizationId" = $1 AND "docId" = $2 AND "headVersionId" = $3
        ORDER BY "createdAt" DESC
        LIMIT 1
      `,
      [doc.organizationId, doc.id, versionId],
    );
    const diff = result.rows[0];
    if (diff === undefined) {
      throw new CatalogError("diff_not_found", 404, "Diff not found");
    }
    return this.versionDiffResponse(diff);
  }

  public async previewDiff(): Promise<VersionDiffResponse> {
    return {
      id: "preview",
      classification: "none",
      markdown: "## No functional changes\n\nNo functional OpenAPI changes were detected.",
      changes: [],
    };
  }

  public async listWebhooks(orgSlug: string): Promise<readonly WebhookResponse[]> {
    const organizationId = await this.organizationId(orgSlug);
    const result = await this.database().query<WebhookRow>(
      `
        SELECT id, url, description, "eventTypes", enabled, "createdAt", "updatedAt"
        FROM "Webhook"
        WHERE "organizationId" = $1
        ORDER BY "createdAt" DESC
      `,
      [organizationId],
    );
    return result.rows.map((row) => this.webhookResponse(row));
  }

  public async createWebhook(orgSlug: string, body: unknown): Promise<CreateWebhookResponse> {
    const parsed = createWebhookSchema.safeParse(body);
    if (!parsed.success) {
      throw new CatalogError("invalid_webhook_request", 400, "Invalid webhook request");
    }
    const organizationId = await this.organizationId(orgSlug);
    const id = `wh_${randomUUID()}`;
    const secret = `bumd_whsec_${randomBytes(24).toString("hex")}`;
    const result = await this.database().query<WebhookRow>(
      `
        INSERT INTO "Webhook" (id, "organizationId", url, description, "secretRef", "eventTypes", enabled, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
        RETURNING id, url, description, "eventTypes", enabled, "createdAt", "updatedAt"
      `,
      [id, organizationId, parsed.data.url, parsed.data.description ?? null, secret, parsed.data.eventTypes],
    );
    const webhook = result.rows[0];
    if (webhook === undefined) {
      throw new CatalogError("webhook_create_failed", 500, "Webhook could not be created");
    }
    return { ...this.webhookResponse(webhook), secret };
  }

  public async rotateWebhookSecret(orgSlug: string, webhookId: string): Promise<{ readonly id: string; readonly secret: string }> {
    const organizationId = await this.organizationId(orgSlug);
    const secret = `bumd_whsec_${randomBytes(24).toString("hex")}`;
    const result = await this.database().query<{ readonly id: string }>(
      `
        UPDATE "Webhook"
        SET "secretRef" = $1, "updatedAt" = NOW()
        WHERE id = $2 AND "organizationId" = $3
        RETURNING id
      `,
      [secret, webhookId, organizationId],
    );
    if (result.rows[0] === undefined) {
      throw new CatalogError("webhook_not_found", 404, "Webhook not found");
    }
    return { id: webhookId, secret };
  }

  private async fetchSpec(objectKey: string): Promise<Record<string, unknown>> {
    this.logger.log(`fetchSpec: fetching R2 key=${objectKey}`);
    try {
      const raw = await this.objectStore.get(objectKey);
      this.logger.log(`fetchSpec: got ${raw.length} chars from R2`);
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          this.logger.log(`fetchSpec: parsed as JSON OK`);
          return parsed as Record<string, unknown>;
        }
      } catch {
        const parsed: unknown = parseYaml(raw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          this.logger.log(`fetchSpec: parsed as YAML OK`);
          return parsed as Record<string, unknown>;
        }
      }
      this.logger.warn(`fetchSpec: could not parse spec from R2 key=${objectKey}`);
      return {};
    } catch (err) {
      this.logger.error(`fetchSpec: failed to fetch from R2 key=${objectKey} — ${String(err)}`);
      return {};
    }
  }

  private async findDoc(orgSlug: string, docSlug: string): Promise<DocRow> {

    const result = await this.database().query<DocRow>(
      `
        SELECT d.id, d."organizationId", d.slug, d.name, d.visibility
        FROM "Doc" d
        INNER JOIN "Organization" o ON o.id = d."organizationId"
        WHERE o.slug = $1 AND d.slug = $2
        LIMIT 1
      `,
      [orgSlug, docSlug],
    );
    const doc = result.rows[0];
    if (doc === undefined) {
      throw new CatalogError("doc_not_found", 404, "Doc not found");
    }
    return doc;
  }

  private async organizationId(orgSlug: string): Promise<string> {
    const result = await this.database().query<{ readonly id: string }>(
      `SELECT id FROM "Organization" WHERE slug = $1 LIMIT 1`,
      [orgSlug],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new CatalogError("organization_not_found", 404, "Organization not found");
    }
    return row.id;
  }

  private async defaultBranch(docId: string): Promise<BranchRow> {
    const result = await this.database().query<BranchRow>(
      `SELECT id, slug FROM "Branch" WHERE "docId" = $1 ORDER BY "createdAt" ASC LIMIT 1`,
      [docId],
    );
    const branch = result.rows[0];
    if (branch === undefined) {
      throw new CatalogError("branch_not_found", 404, "Branch not found");
    }
    return branch;
  }

  private async findBranch(docId: string, branchSlug: string): Promise<BranchRow> {
    const result = await this.database().query<BranchRow>(
      `SELECT id, slug FROM "Branch" WHERE "docId" = $1 AND slug = $2 LIMIT 1`,
      [docId, branchSlug],
    );
    const branch = result.rows[0];
    if (branch === undefined) {
      throw new CatalogError("branch_not_found", 404, "Branch not found");
    }
    return branch;
  }

  private async latestReadyVersionRow(branchId: string): Promise<VersionRow> {
    const result = await this.database().query<VersionRow>(
      `
        SELECT id, sha256, status, "sequenceNumber", "rawSpecObjectKey", "createdAt", "readyAt"
        FROM "Version"
        WHERE "branchId" = $1 AND status = 'ready'
        ORDER BY "readyAt" DESC NULLS LAST, "createdAt" DESC
        LIMIT 1
      `,
      [branchId],
    );
    const version = result.rows[0];
    if (version === undefined) {
      throw new CatalogError("version_not_found", 404, "Version not found");
    }
    return version;
  }

  private async versionRow(branchId: string, versionId: string): Promise<VersionRow> {
    const result = await this.database().query<VersionRow>(
      `
        SELECT id, sha256, status, "createdAt", "readyAt"
        FROM "Version"
        WHERE "branchId" = $1 AND id = $2
        LIMIT 1
      `,
      [branchId, versionId],
    );
    const version = result.rows[0];
    if (version === undefined) {
      throw new CatalogError("version_not_found", 404, "Version not found");
    }
    return version;
  }

  private async diffRow(organizationId: string, docId: string, diffId: string): Promise<DiffRow> {
    const result = await this.database().query<DiffRow>(
      `
        SELECT id, classification, "summaryMarkdown", "diffJson", "createdAt"
        FROM "Diff"
        WHERE "organizationId" = $1 AND "docId" = $2 AND id = $3
        LIMIT 1
      `,
      [organizationId, docId, diffId],
    );
    const diff = result.rows[0];
    if (diff === undefined) {
      throw new CatalogError("diff_not_found", 404, "Diff not found");
    }
    return diff;
  }

  private versionDiffResponse(diff: DiffRow): VersionDiffResponse {
    const changes = this.diffChanges(diff.diffJson);
    return {
      id: diff.id,
      classification: diff.classification,
      markdown: this.diffMarkdown(diff),
      changes,
    };
  }

  private diffTitle(diff: DiffRow): string {
    if (diff.classification === "breaking") {
      return "Breaking changes detected";
    }
    if (diff.classification === "non_breaking") {
      return "Non-breaking changes";
    }
    return "API changes";
  }

  private diffMarkdown(diff: DiffRow): string {
    return diff.summaryMarkdown ?? "## No stored diff summary\n\nThe diff was recorded without a markdown summary.";
  }

  private diffChanges(diffJson: unknown): readonly unknown[] {
    if (typeof diffJson !== "object" || diffJson === null || !("changes" in diffJson)) {
      return [];
    }
    const changes = (diffJson as { readonly changes?: unknown }).changes;
    return Array.isArray(changes) ? changes : [];
  }

  private webhookResponse(row: WebhookRow): WebhookResponse {
    return {
      id: row.id,
      url: row.url,
      description: row.description,
      eventTypes: row.eventTypes,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private database(): Pool {
    if (this.pool === null) {
      const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";
      this.pool = new Pool({ connectionString: databaseUrl });
    }
    return this.pool;
  }
}
