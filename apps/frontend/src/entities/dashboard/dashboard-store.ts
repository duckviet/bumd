import { z } from "zod";
import { getDb } from "../../shared/db";
import { randomUUID } from "node:crypto";

export const DocVisibility = {
  Public: "public",
  Private: "private",
} as const;

export type DocVisibility = (typeof DocVisibility)[keyof typeof DocVisibility];

export const VersionStatus = {
  Queued: "queued",
  Processing: "processing",
  Ready: "ready",
  Failed: "failed",
} as const;

export type VersionStatus = (typeof VersionStatus)[keyof typeof VersionStatus];

export type DashboardVersion = {
  readonly id: string;
  readonly label: string;
  readonly sequenceNumber: number;
  readonly status: VersionStatus;
  readonly sha256: string;
  readonly createdAt: string;
  readonly readyAt: string | null;
};

export type DashboardDoc = {
  readonly organizationSlug: string;
  readonly slug: string;
  readonly name: string;
  readonly visibility: DocVisibility;
  readonly theme: string;
  readonly publicUrl: string;
  readonly versions: readonly DashboardVersion[];
  readonly createdAt: string;
};

const createDocSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  visibility: z.union([z.literal("public"), z.literal("private")]),
  theme: z.string().trim().min(1).max(64),
});

const updateSettingsSchema = z.object({
  visibility: z.union([z.literal("public"), z.literal("private")]),
  theme: z.string().trim().min(1).max(64),
});

export type CreateDocInput = z.infer<typeof createDocSchema>;
export type UpdateDocSettingsInput = z.infer<typeof updateSettingsSchema>;

function mapVersionRowToDashboardVersion(row: Record<string, unknown>): DashboardVersion {
  const status = row["status"] as VersionStatus;
  const createdAt = row["createdAt"] as Date;
  const readyAt = row["readyAt"] as Date | null;
  return {
    id: row["id"] as string,
    label: `v${row["sequenceNumber"] as number}`,
    sequenceNumber: row["sequenceNumber"] as number,
    status,
    sha256: row["sha256"] as string,
    createdAt: createdAt.toISOString(),
    readyAt: readyAt !== null ? readyAt.toISOString() : null,
  };
}

function mapDocRowToDashboardDoc(row: Record<string, unknown>, organizationSlug: string, versions: DashboardVersion[]): DashboardDoc {
  let theme = "classic";
  const themeConfig = row["themeConfig"];
  if (themeConfig !== null && typeof themeConfig === "object" && !Array.isArray(themeConfig)) {
    const config = themeConfig as Record<string, unknown>;
    if (typeof config["theme"] === "string") {
      theme = config["theme"];
    }
  }
  const createdAt = row["createdAt"] as Date;
  return {
    organizationSlug,
    slug: row["slug"] as string,
    name: row["name"] as string,
    visibility: row["visibility"] as DocVisibility,
    theme,
    publicUrl: `/${organizationSlug}/${row["slug"] as string}`,
    versions,
    createdAt: createdAt.toISOString(),
  };
}

export async function listDashboardDocs(organizationSlug: string): Promise<readonly DashboardDoc[]> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    return [];
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const docsRes = await db.query(
    'SELECT * FROM "Doc" WHERE "organizationId" = $1 ORDER BY "createdAt" DESC',
    [orgId]
  );

  const docs: DashboardDoc[] = [];
  for (const row of docsRes.rows) {
    const versionsRes = await db.query(
      'SELECT * FROM "Version" WHERE "docId" = $1 ORDER BY "sequenceNumber" DESC',
      [row["id"] as string]
    );
    const versions = versionsRes.rows.map(mapVersionRowToDashboardVersion);
    docs.push(mapDocRowToDashboardDoc(row, organizationSlug, versions));
  }
  return docs;
}

export async function getDashboardDoc(organizationSlug: string, docSlug: string): Promise<DashboardDoc | null> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    return null;
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const docRes = await db.query(
    'SELECT * FROM "Doc" WHERE "organizationId" = $1 AND slug = $2',
    [orgId, docSlug]
  );
  if (docRes.rows.length === 0) {
    return null;
  }
  const docRow = docRes.rows[0];

  const versionsRes = await db.query(
    'SELECT * FROM "Version" WHERE "docId" = $1 ORDER BY "sequenceNumber" DESC',
    [docRow["id"] as string]
  );
  const versions = versionsRes.rows.map(mapVersionRowToDashboardVersion);
  return mapDocRowToDashboardDoc(docRow, organizationSlug, versions);
}

export async function createDashboardDoc(organizationSlug: string, input: unknown): Promise<{ readonly kind: "created"; readonly doc: DashboardDoc } | { readonly kind: "duplicate" | "invalid" }> {
  const parsed = createDocSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid" };
  }
  const db = getDb();

  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    return { kind: "invalid" };
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const duplicate = await db.query(
    'SELECT id FROM "Doc" WHERE "organizationId" = $1 AND slug = $2',
    [orgId, parsed.data.slug]
  );
  if (duplicate.rows.length > 0) {
    return { kind: "duplicate" };
  }

  const docId = `doc_${parsed.data.slug}_${randomUUID().slice(0, 8)}`;
  const themeConfig = { theme: parsed.data.theme };

  await db.query(
    'INSERT INTO "Doc" (id, "organizationId", slug, name, visibility, "themeConfig", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
    [docId, orgId, parsed.data.slug, parsed.data.name, parsed.data.visibility, JSON.stringify(themeConfig)]
  );

  const doc: DashboardDoc = {
    organizationSlug,
    slug: parsed.data.slug,
    name: parsed.data.name,
    visibility: parsed.data.visibility as DocVisibility,
    theme: parsed.data.theme,
    publicUrl: `/${organizationSlug}/${parsed.data.slug}`,
    versions: [],
    createdAt: new Date().toISOString(),
  };

  return { kind: "created", doc };
}

export async function updateDashboardDocSettings(organizationSlug: string, docSlug: string, input: unknown): Promise<{ readonly kind: "updated"; readonly doc: DashboardDoc } | { readonly kind: "missing" | "invalid" }> {
  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid" };
  }
  const db = getDb();

  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    return { kind: "missing" };
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const docRes = await db.query(
    'SELECT * FROM "Doc" WHERE "organizationId" = $1 AND slug = $2',
    [orgId, docSlug]
  );
  if (docRes.rows.length === 0) {
    return { kind: "missing" };
  }
  const docRow = docRes.rows[0];

  const themeConfig = { theme: parsed.data.theme };
  await db.query(
    'UPDATE "Doc" SET visibility = $1, "themeConfig" = $2, "updatedAt" = NOW() WHERE id = $3',
    [parsed.data.visibility, JSON.stringify(themeConfig), docRow["id"] as string]
  );

  const versionsRes = await db.query(
    'SELECT * FROM "Version" WHERE "docId" = $1 ORDER BY "sequenceNumber" DESC',
    [docRow["id"] as string]
  );
  const versions = versionsRes.rows.map(mapVersionRowToDashboardVersion);

  const updatedDoc: DashboardDoc = {
    organizationSlug,
    slug: docSlug,
    name: docRow["name"] as string,
    visibility: parsed.data.visibility as DocVisibility,
    theme: parsed.data.theme,
    publicUrl: `/${organizationSlug}/${docSlug}`,
    versions,
    createdAt: (docRow["createdAt"] as Date).toISOString(),
  };

  return { kind: "updated", doc: updatedDoc };
}

function latestFirst(versions: readonly DashboardVersion[]): readonly DashboardVersion[] {
  return [...versions].sort((left, right) => right.sequenceNumber - left.sequenceNumber);
}

export function latestVersion(doc: DashboardDoc): DashboardVersion | null {
  return latestFirst(doc.versions)[0] ?? null;
}

export function versionHistory(doc: DashboardDoc): readonly DashboardVersion[] {
  return latestFirst(doc.versions);
}

export async function deleteDashboardDoc(
  organizationSlug: string,
  docSlug: string
): Promise<{ readonly kind: "deleted" } | { readonly kind: "missing" }> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    return { kind: "missing" };
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const docRes = await db.query(
    'SELECT id FROM "Doc" WHERE "organizationId" = $1 AND slug = $2',
    [orgId, docSlug]
  );
  if (docRes.rows.length === 0) {
    return { kind: "missing" };
  }
  const docId = docRes.rows[0]["id"] as string;

  await db.query('DELETE FROM "Doc" WHERE id = $1', [docId]);
  return { kind: "deleted" };
}
