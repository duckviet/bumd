import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { CatalogError } from "./catalog-errors.js";
import type {
  ChangeSummaryResponse,
  CreateWebhookResponse,
  DiffDetailResponse,
  JobStatusResponse,
  LatestReadyVersionResponse,
  MemberListResponse,
  MemberResponse,
  PortalDocResponse,
  VersionDiffResponse,
  VersionReadResponse,
  WebhookResponse,
  InviteListResponse,
  CreateInviteResponse,
  InviteResponse,
} from "./catalog-types.js";
import { OBJECT_STORE, type ObjectStore } from "../storage/object-store-port.js";
import { encryptSecret } from "../webhooks/webhook-encryption.js";

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

type JobRow = {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly versionId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly attemptCount: number;
  readonly error: unknown | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type MemberRow = {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

const membershipRoleSchema = z.union([z.literal("owner"), z.literal("admin"), z.literal("member"), z.literal("guest")]);

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
        SELECT id, classification, "diff_markdown" AS "summaryMarkdown", "diff_json" AS "diffJson", "createdAt"
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
        SELECT id, classification, "diff_markdown" AS "summaryMarkdown", "diff_json" AS "diffJson", "createdAt"
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
    const encryptedSecret = encryptSecret(secret);
    const result = await this.database().query<WebhookRow>(
      `
        INSERT INTO "Webhook" (id, "organizationId", url, description, "secretRef", "eventTypes", enabled, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
        RETURNING id, url, description, "eventTypes", enabled, "createdAt", "updatedAt"
      `,
      [id, organizationId, parsed.data.url, parsed.data.description ?? null, encryptedSecret, parsed.data.eventTypes],
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
    const encryptedSecret = encryptSecret(secret);
    const result = await this.database().query<{ readonly id: string }>(
      `
        UPDATE "Webhook"
        SET "secretRef" = $1, "updatedAt" = NOW()
        WHERE id = $2 AND "organizationId" = $3
        RETURNING id
      `,
      [encryptedSecret, webhookId, organizationId],
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
        ORDER BY "sequenceNumber" DESC
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
        SELECT id, classification, "diff_markdown" AS "summaryMarkdown", "diff_json" AS "diffJson", "createdAt"
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

  async jobStatus(orgSlug: string, jobId: string): Promise<JobStatusResponse> {
    const result = await this.database().query<JobRow>(
      `SELECT j.id, j.type::text AS type, j.status::text AS status, j."versionId", j."docId", j."branchId",
              j."attemptCount", j.error, j."createdAt", j."updatedAt"
       FROM "ProcessingJob" j
       INNER JOIN "Organization" o ON o.id = j."organizationId"
       WHERE o.slug = $1 AND j.id = $2
       LIMIT 1`,
      [orgSlug, jobId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new CatalogError("job_not_found", 404, "Job not found");
    }

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      versionId: row.versionId,
      docId: row.docId,
      branchId: row.branchId,
      attemptCount: row.attemptCount,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listMembers(orgSlug: string, organizationId: string): Promise<MemberListResponse> {
    const result = await this.database().query<MemberRow>(
      `SELECT m.id, m."userId", u.email, u.name, m.role::text AS role, m."createdAt", m."updatedAt"
       FROM "Membership" m
       INNER JOIN "Organization" o ON o.id = m."organizationId"
       INNER JOIN "User" u ON u.id = m."userId"
       WHERE o.slug = $1 AND (o.id = $2 OR o.slug = $2)
       ORDER BY u.email ASC`,
      [orgSlug, organizationId],
    );
    return { members: result.rows.map((row) => this.memberResponse(row)) };
  }

  async updateMemberRole(orgSlug: string, organizationId: string, memberId: string, body: unknown): Promise<MemberResponse> {
    const parsed = z.object({ role: membershipRoleSchema }).safeParse(body);
    if (!parsed.success) {
      throw new CatalogError("malformed", 400, "Malformed member role request");
    }

    const result = await this.database().query<MemberRow>(
      `UPDATE "Membership" m
       SET role = $4::"MembershipRole", "updatedAt" = NOW()
       FROM "Organization" o, "User" u
       WHERE m."organizationId" = o.id
         AND m."userId" = u.id
         AND o.slug = $1
         AND (o.id = $2 OR o.slug = $2)
         AND m.id = $3
       RETURNING m.id, m."userId", u.email, u.name, m.role::text AS role, m."createdAt", m."updatedAt"`,
      [orgSlug, organizationId, memberId, parsed.data.role],
    );
    const row = result.rows[0];
    if (!row) {
      throw new CatalogError("member_not_found", 404, "Member not found");
    }
    return this.memberResponse(row);
  }

  async deleteMember(orgSlug: string, organizationId: string, memberId: string): Promise<void> {
    const result = await this.database().query(
      `DELETE FROM "Membership" m
       USING "Organization" o
       WHERE m."organizationId" = o.id
         AND o.slug = $1
         AND (o.id = $2 OR o.slug = $2)
         AND m.id = $3`,
      [orgSlug, organizationId, memberId],
    );
    if (result.rowCount === 0) {
      throw new CatalogError("member_not_found", 404, "Member not found");
    }
  }

  private memberResponse(row: MemberRow): MemberResponse {
    return {
      id: row.id,
      userId: row.userId,
      email: row.email,
      name: row.name,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
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

  async listInvites(orgSlug: string, organizationId: string): Promise<InviteListResponse> {
    const result = await this.database().query<any>(
      `SELECT i.id, i.email, i.role::text AS role, i."expiresAt", i."acceptedAt", i."revokedAt", i."createdBy", i."acceptedByUserId", i."createdAt", i."updatedAt"
       FROM "Invite" i
       INNER JOIN "Organization" o ON o.id = i."organizationId"
       WHERE o.slug = $1 AND (o.id = $2 OR o.slug = $2)
       ORDER BY i."createdAt" DESC`,
      [orgSlug, organizationId],
    );
    return {
      invites: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        expiresAt: row.expiresAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        createdBy: row.createdBy,
        acceptedByUserId: row.acceptedByUserId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async createInvite(
    orgSlug: string,
    organizationId: string,
    createdBy: string,
    body: unknown,
  ): Promise<CreateInviteResponse> {
    const createInviteSchema = z.object({
      email: z.string().email().optional().nullable(),
      role: z.union([z.literal("owner"), z.literal("admin"), z.literal("member"), z.literal("guest")]),
      expiresAt: z.string().datetime().optional(),
    });

    const parsed = createInviteSchema.safeParse(body);
    if (!parsed.success) {
      throw new CatalogError("malformed", 400, "Malformed invite request");
    }

    const orgId = await this.organizationId(orgSlug);
    if (orgId !== organizationId && orgSlug !== organizationId) {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }

    const token = `bumd_inv_${randomBytes(24).toString("hex")}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const id = `inv_${randomUUID()}`;

    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await this.database().query<any>(
      `INSERT INTO "Invite" (id, "tokenHash", "organizationId", email, role, "expiresAt", "createdBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"MembershipRole", $6, $7, NOW(), NOW())
       RETURNING id, email, role::text AS role, "expiresAt", "acceptedAt", "revokedAt", "createdBy", "acceptedByUserId", "createdAt", "updatedAt"`,
      [id, tokenHash, orgId, parsed.data.email ?? null, parsed.data.role, expiresAt, createdBy],
    );

    const row = result.rows[0];
    if (!row) {
      throw new CatalogError("failed", 500, "Failed to create invite");
    }

    return {
      id: row.id,
      token,
      email: row.email,
      role: row.role,
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdBy: row.createdBy,
      acceptedByUserId: row.acceptedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async deleteInvite(orgSlug: string, organizationId: string, inviteId: string): Promise<void> {
    const orgId = await this.organizationId(orgSlug);
    if (orgId !== organizationId && orgSlug !== organizationId) {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }

    const result = await this.database().query(
      `UPDATE "Invite"
       SET "revokedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $1 AND "organizationId" = $2 AND "revokedAt" IS NULL
       RETURNING id`,
      [inviteId, orgId],
    );

    if (result.rowCount === 0) {
      throw new CatalogError("invite_not_found", 404, "Invite not found or already revoked");
    }
  }

  async acceptInviteToken(orgSlug: string, body: unknown): Promise<{ readonly status: string }> {
    const acceptSchema = z.object({
      token: z.string().min(1),
      userId: z.string().min(1),
    });

    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      throw new CatalogError("malformed", 400, "Malformed accept invite request");
    }

    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const res = await this.database().query<any>(
      `SELECT i.*, o.slug AS "orgSlug"
       FROM "Invite" i
       INNER JOIN "Organization" o ON o.id = i."organizationId"
       WHERE i."tokenHash" = $1`,
      [tokenHash]
    );

    if (res.rows.length === 0) {
      throw new CatalogError("invalid_token", 400, "Invite token is invalid or expired");
    }

    const invite = res.rows[0];

    if (invite.orgSlug !== orgSlug) {
      throw new CatalogError("wrong_organization", 400, "Invite does not belong to this organization");
    }

    const expiresAtVal = invite.expiresAt;
    const expiresAtTime = expiresAtVal instanceof Date ? expiresAtVal.getTime() : new Date(expiresAtVal as string).getTime();

    if (invite.acceptedByUserId !== null || invite.revokedAt !== null || expiresAtTime <= Date.now()) {
      throw new CatalogError("invalid_token", 400, "Invite token is invalid or expired");
    }

    await this.database().query(
      `UPDATE "Invite"
       SET "acceptedByUserId" = $1, "acceptedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $2`,
      [parsed.data.userId, invite.id]
    );

    const memId = `mem_${parsed.data.userId}_${invite.orgSlug}_${randomUUID().slice(0, 8)}`;
    await this.database().query(
      `INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4::"MembershipRole", NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [memId, invite.organizationId, parsed.data.userId, invite.role]
    );

    return { status: "accepted" };
  }

  async updateWebhook(
    orgSlug: string,
    organizationId: string,
    webhookId: string,
    body: unknown,
  ): Promise<WebhookResponse> {
    const updateWebhookSchema = z.object({
      url: z.string().url().optional(),
      description: z.string().trim().max(200).optional().nullable(),
      eventTypes: z.array(z.string().min(1)).min(1).optional(),
      enabled: z.boolean().optional(),
    });

    const parsed = updateWebhookSchema.safeParse(body);
    if (!parsed.success) {
      throw new CatalogError("malformed", 400, "Malformed update webhook request");
    }

    const orgId = await this.organizationId(orgSlug);
    if (orgId !== organizationId && orgSlug !== organizationId) {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (parsed.data.url !== undefined) {
      fields.push(`url = $${paramIndex++}`);
      values.push(parsed.data.url);
    }
    if (parsed.data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(parsed.data.description);
    }
    if (parsed.data.eventTypes !== undefined) {
      fields.push(`"eventTypes" = $${paramIndex++}`);
      values.push(parsed.data.eventTypes);
    }
    if (parsed.data.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(parsed.data.enabled);
    }

    if (fields.length === 0) {
      const result = await this.database().query<WebhookRow>(
        `SELECT id, url, description, "eventTypes", enabled, "createdAt", "updatedAt"
         FROM "Webhook"
         WHERE id = $1 AND "organizationId" = $2`,
        [webhookId, orgId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new CatalogError("webhook_not_found", 404, "Webhook not found");
      }
      return this.webhookResponse(row);
    }

    values.push(webhookId, orgId);
    const query = `
      UPDATE "Webhook"
      SET ${fields.join(", ")}, "updatedAt" = NOW()
      WHERE id = $${paramIndex++} AND "organizationId" = $${paramIndex++}
      RETURNING id, url, description, "eventTypes", enabled, "createdAt", "updatedAt"
    `;

    const result = await this.database().query<WebhookRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new CatalogError("webhook_not_found", 404, "Webhook not found");
    }
    return this.webhookResponse(row);
  }

  async deleteWebhook(orgSlug: string, organizationId: string, webhookId: string): Promise<void> {
    const orgId = await this.organizationId(orgSlug);
    if (orgId !== organizationId && orgSlug !== organizationId) {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }

    const result = await this.database().query(
      `DELETE FROM "Webhook"
       WHERE id = $1 AND "organizationId" = $2`,
      [webhookId, orgId],
    );

    if (result.rowCount === 0) {
      throw new CatalogError("webhook_not_found", 404, "Webhook not found");
    }
  }

  async listWebhookDeliveries(orgSlug: string, organizationId: string, webhookId: string): Promise<any> {
    const orgId = await this.organizationId(orgSlug);
    if (orgId !== organizationId && orgSlug !== organizationId) {
      throw new CatalogError("forbidden", 403, "Forbidden");
    }

    const whCheck = await this.database().query(
      `SELECT id FROM "Webhook" WHERE id = $1 AND "organizationId" = $2`,
      [webhookId, orgId],
    );
    if (whCheck.rows.length === 0) {
      throw new CatalogError("webhook_not_found", 404, "Webhook not found");
    }

    const result = await this.database().query<any>(
      `SELECT id, "webhookId", "eventId", "eventType", payload, status::text AS status, "attemptCount", "status_code" AS "statusCode", success, "lastError", "nextAttemptAt", "createdAt", "updatedAt"
       FROM "WebhookDelivery"
       WHERE "webhookId" = $1 AND "organizationId" = $2
       ORDER BY "createdAt" DESC`,
      [webhookId, orgId],
    );

    return {
      deliveries: result.rows.map((row) => ({
        id: row.id,
        webhookId: row.webhookId,
        eventId: row.eventId,
        eventType: row.eventType,
        payload: row.payload,
        status: row.status,
        attemptCount: row.attemptCount,
        statusCode: row.statusCode,
        success: row.success,
        lastError: row.lastError,
        nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
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
