import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { CatalogError } from "./catalog-errors.js";

const visibilitySchema = z.union([z.literal("public"), z.literal("private")]);
const statusSchema = z.union([z.literal("queued"), z.literal("processing"), z.literal("ready"), z.literal("failed")]);
const createSchema = z.object({ name: z.string().trim().min(1).max(100), slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), visibility: visibilitySchema, theme: z.string().trim().min(1).max(64) });
const updateSchema = z.object({ visibility: visibilitySchema, theme: z.string().trim().min(1).max(64) });
const docRowSchema = z.object({ id: z.string(), slug: z.string(), name: z.string(), visibility: visibilitySchema, themeConfig: z.unknown().nullable(), createdAt: z.coerce.date() });
const versionRowSchema = z.object({ id: z.string(), sequenceNumber: z.number().int(), status: statusSchema, sha256: z.string(), createdAt: z.coerce.date(), readyAt: z.coerce.date().nullable() });

type DashboardDoc = {
  readonly organizationSlug: string; readonly id: string; readonly slug: string; readonly name: string;
  readonly visibility: z.infer<typeof visibilitySchema>; readonly theme: string; readonly publicUrl: string;
  readonly versions: readonly DashboardVersion[]; readonly createdAt: string;
};
type DashboardVersion = { readonly id: string; readonly label: string; readonly sequenceNumber: number; readonly status: z.infer<typeof statusSchema>; readonly sha256: string; readonly createdAt: string; readonly readyAt: string | null };

@Injectable()
export class DashboardDocsService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd" });

  public async onModuleDestroy(): Promise<void> { await this.pool.end(); }

  public async list(orgSlug: string): Promise<readonly DashboardDoc[]> {
    const result = await this.pool.query(
      `SELECT d.id, d.slug, d.name, d.visibility::text AS visibility, d."themeConfig", d."createdAt"
       FROM "Doc" d JOIN "Organization" o ON o.id = d."organizationId" WHERE o.slug = $1 ORDER BY d."createdAt" DESC`, [orgSlug],
    );
    return Promise.all(result.rows.map(async (value: unknown) => this.doc(value, orgSlug)));
  }

  public async get(orgSlug: string, docSlug: string): Promise<DashboardDoc> {
    const result = await this.pool.query(
      `SELECT d.id, d.slug, d.name, d.visibility::text AS visibility, d."themeConfig", d."createdAt"
       FROM "Doc" d JOIN "Organization" o ON o.id = d."organizationId" WHERE o.slug = $1 AND d.slug = $2 LIMIT 1`, [orgSlug, docSlug],
    );
    if (result.rows[0] === undefined) throw new CatalogError("doc_not_found", 404, "Doc not found");
    return this.doc(result.rows[0], orgSlug);
  }

  public async create(orgSlug: string, body: unknown): Promise<DashboardDoc> {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new CatalogError("invalid_doc_request", 400, "Invalid doc request");
    const organizationId = await this.organizationId(orgSlug);
    const id = `doc_${parsed.data.slug}_${randomUUID().slice(0, 8)}`;
    try {
      const result = await this.pool.query(
        `INSERT INTO "Doc" (id, "organizationId", slug, name, visibility, "themeConfig", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id, slug, name, visibility::text AS visibility, "themeConfig", "createdAt"`,
        [id, organizationId, parsed.data.slug, parsed.data.name, parsed.data.visibility, JSON.stringify({ theme: parsed.data.theme })],
      );
      return this.doc(result.rows[0], orgSlug);
    } catch (error) {
      if (isUniqueViolation(error)) throw new CatalogError("duplicate_doc", 409, "Doc slug already exists");
      throw error;
    }
  }

  public async update(orgSlug: string, docSlug: string, body: unknown): Promise<DashboardDoc> {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) throw new CatalogError("invalid_doc_request", 400, "Invalid doc request");
    const result = await this.pool.query(
      `UPDATE "Doc" d SET visibility = $3, "themeConfig" = $4, "updatedAt" = NOW() FROM "Organization" o
       WHERE d."organizationId" = o.id AND o.slug = $1 AND d.slug = $2
       RETURNING d.id, d.slug, d.name, d.visibility::text AS visibility, d."themeConfig", d."createdAt"`,
      [orgSlug, docSlug, parsed.data.visibility, JSON.stringify({ theme: parsed.data.theme })],
    );
    if (result.rows[0] === undefined) throw new CatalogError("doc_not_found", 404, "Doc not found");
    return this.doc(result.rows[0], orgSlug);
  }

  public async delete(orgSlug: string, docSlug: string): Promise<void> {
    const result = await this.pool.query(
      `DELETE FROM "Doc" d USING "Organization" o WHERE d."organizationId" = o.id AND o.slug = $1 AND d.slug = $2`, [orgSlug, docSlug],
    );
    if (result.rowCount === 0) throw new CatalogError("doc_not_found", 404, "Doc not found");
  }

  public async versionDetail(orgSlug: string, docSlug: string, versionId: string): Promise<unknown> {
    const result = await this.pool.query(
      `SELECT v.id, v."sequenceNumber", v.status::text AS status, v.sha256, v."createdByTokenId", v."createdByUserId", v."createdAt", v."readyAt", b.name AS "branchName", d.name AS "docName",
              x.id AS "diffId", x.classification::text AS classification, x."hasBreaking"
       FROM "Version" v JOIN "Branch" b ON b.id = v."branchId" JOIN "Doc" d ON d.id = v."docId" JOIN "Organization" o ON o.id = d."organizationId"
       LEFT JOIN "Diff" x ON x."headVersionId" = v.id WHERE o.slug = $1 AND d.slug = $2 AND v.id = $3 LIMIT 1`, [orgSlug, docSlug, versionId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new CatalogError("version_not_found", 404, "Version not found");
    return { ...row, createdAt: dateString(Reflect.get(row, "createdAt")), readyAt: nullableDateString(Reflect.get(row, "readyAt")), diff: Reflect.get(row, "diffId") === null ? null : { id: Reflect.get(row, "diffId"), classification: Reflect.get(row, "classification"), hasBreaking: Reflect.get(row, "hasBreaking") } };
  }

  public async diffDetail(orgSlug: string, docSlug: string, versionId: string): Promise<unknown> {
    const result = await this.pool.query(
      `SELECT v.id AS "versionId", v."sequenceNumber", d.name AS "docName", x.id, x.classification::text AS classification, x."hasBreaking", x.changes, x."diff_markdown" AS "diffMarkdown"
       FROM "Version" v JOIN "Doc" d ON d.id = v."docId" JOIN "Organization" o ON o.id = d."organizationId" JOIN "Diff" x ON x."headVersionId" = v.id
       WHERE o.slug = $1 AND d.slug = $2 AND v.id = $3 LIMIT 1`, [orgSlug, docSlug, versionId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new CatalogError("diff_not_found", 404, "Diff not found");
    return row;
  }

  public async testsContext(orgSlug: string, docSlug: string): Promise<unknown> {
    const context = await this.pool.query(
      `SELECT o.id AS "organizationId", d.id AS "docId", COALESCE(db.id, fb.id) AS "branchId", COALESCE(db.slug, fb.slug) AS "branchSlug"
       FROM "Doc" d JOIN "Organization" o ON o.id = d."organizationId" LEFT JOIN "Branch" db ON db.id = d."defaultBranchId"
       LEFT JOIN LATERAL (SELECT id, slug FROM "Branch" WHERE "docId" = d.id ORDER BY "createdAt" ASC LIMIT 1) fb ON true
       WHERE o.slug = $1 AND d.slug = $2 LIMIT 1`, [orgSlug, docSlug],
    );
    const row = context.rows[0];
    if (row === undefined) throw new CatalogError("doc_not_found", 404, "Doc not found");
    const branchId = Reflect.get(row, "branchId");
    if (typeof branchId !== "string") return { organizationId: Reflect.get(row, "organizationId"), docId: Reflect.get(row, "docId"), branchId: "", branchSlug: "", workflows: [] };
    const workflows = await this.pool.query(
      `SELECT id, name, slug, description, tags, priority::text AS priority, type::text AS type,
              "definitionJson", revision, "createdAt", "updatedAt" FROM "TestWorkflow"
       WHERE "organizationId" = $1 AND "docId" = $2 AND "branchId" = $3 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 100`,
      [Reflect.get(row, "organizationId"), Reflect.get(row, "docId"), branchId],
    );
    return { organizationId: Reflect.get(row, "organizationId"), docId: Reflect.get(row, "docId"), branchId, branchSlug: Reflect.get(row, "branchSlug"), workflows: workflows.rows.map((workflow: object) => ({ ...workflow, createdAt: dateString(Reflect.get(workflow, "createdAt")), updatedAt: dateString(Reflect.get(workflow, "updatedAt")) })) };
  }

  private async doc(value: unknown, orgSlug: string): Promise<DashboardDoc> {
    const row = docRowSchema.parse(value);
    const versions = await this.pool.query(
      `SELECT id, "sequenceNumber", status::text AS status, sha256, "createdAt", "readyAt" FROM "Version" WHERE "docId" = $1 ORDER BY "sequenceNumber" DESC`, [row.id],
    );
    return { organizationSlug: orgSlug, id: row.id, slug: row.slug, name: row.name, visibility: row.visibility, theme: theme(row.themeConfig), publicUrl: `/${orgSlug}/${row.slug}`, versions: versions.rows.map(version), createdAt: row.createdAt.toISOString() };
  }

  private async organizationId(orgSlug: string): Promise<string> {
    const result = await this.pool.query<{ readonly id: string }>('SELECT id FROM "Organization" WHERE slug = $1 LIMIT 1', [orgSlug]);
    const row = result.rows[0];
    if (row === undefined) throw new CatalogError("organization_not_found", 404, "Organization not found");
    return row.id;
  }
}

function version(value: unknown): DashboardVersion {
  const row = versionRowSchema.parse(value);
  return { id: row.id, label: `v${row.sequenceNumber}`, sequenceNumber: row.sequenceNumber, status: row.status, sha256: row.sha256, createdAt: row.createdAt.toISOString(), readyAt: row.readyAt?.toISOString() ?? null };
}

function theme(value: unknown): string {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof Reflect.get(value, "theme") === "string" ? String(Reflect.get(value, "theme")) : "classic";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "23505";
}
function dateString(value: unknown): string { return value instanceof Date ? value.toISOString() : String(value); }
function nullableDateString(value: unknown): string | null { return value === null || value === undefined ? null : dateString(value); }
