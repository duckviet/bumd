import { redirect } from "next/navigation";
import { requireDashboardManage } from "../../../dashboard-helpers";
import { getDb } from "../../../../../../../shared/db";
import crypto from "node:crypto";
import { backendBaseUrl } from "../../../../../../../shared/config/env";

type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { org, doc: docSlug } = await context.params;
  const { session } = await requireDashboardManage(org);

  const form = await request.formData();
  const file = form.get("specFile");
  const branchSlug = (form.get("branch") as string || "main").trim();

  if (!(file instanceof File) || file.size === 0 || branchSlug === "") {
    return new Response("Invalid upload files or branch", { status: 400 });
  }

  const specContent = await file.text();
  const fileBase64 = Buffer.from(specContent, "utf8").toString("base64");
  const filename = file.name || "spec.yaml";

  const adminToken = process.env["BUMD_ADMIN_SESSION_TOKEN"] || "test_admin_session_not_secret";
  const tokenRes = await fetch(`${backendBaseUrl()}/v1/orgs/${org}/api-tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: `web-upload-${Date.now()}`,
      role: "member",
      scopes: ["docs:deploy"],
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return new Response(`Failed to authenticate with backend: ${errText}`, { status: 500 });
  }

  const tokenData = await tokenRes.json();
  const apiToken = tokenData.token;

  const deployRes = await fetch(`${backendBaseUrl()}/v1/orgs/${org}/docs/${docSlug}/branches/${branchSlug}/deploys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      orgSlug: org,
      docSlug: docSlug,
      branchSlug: branchSlug,
      filename: filename,
      sourceFormat: "openapi",
      specBase64: fileBase64,
    }),
  });

  if (!deployRes.ok) {
    const errText = await deployRes.text();
    return new Response(`Failed to deploy spec to backend: ${errText}`, { status: 500 });
  }

  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [org]);
  if (orgRes.rows.length === 0) {
    return new Response("Organization not found in database", { status: 404 });
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const docRes = await db.query('SELECT id FROM "Doc" WHERE "organizationId" = $1 AND slug = $2', [orgId, docSlug]);
  if (docRes.rows.length === 0) {
    return new Response("Doc not found in database", { status: 404 });
  }
  const docId = docRes.rows[0]["id"] as string;

  let branchRes = await db.query('SELECT id FROM "Branch" WHERE "docId" = $1 AND slug = $2', [docId, branchSlug]);
  let branchId: string;
  if (branchRes.rows.length === 0) {
    branchId = `br_${branchSlug}_${crypto.randomUUID().slice(0, 8)}`;
    await db.query(
      'INSERT INTO "Branch" (id, "organizationId", "docId", name, slug, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
      [branchId, orgId, docId, branchSlug, branchSlug]
    );
  } else {
    branchId = branchRes.rows[0]["id"] as string;
  }

  const sha256 = crypto.createHash("sha256").update(specContent).digest("hex");
  const existingRes = await db.query('SELECT id FROM "Version" WHERE "docId" = $1 AND "branchId" = $2 AND sha256 = $3', [docId, branchId, sha256]);
  if (existingRes.rows.length === 0) {
    const seqRes = await db.query('SELECT COALESCE(MAX("sequenceNumber"), 0) AS max_seq FROM "Version" WHERE "branchId" = $1', [branchId]);
    const nextSeq = (seqRes.rows[0].max_seq as number) + 1;

    const versionId = `ver_${docSlug}_${crypto.randomUUID().slice(0, 8)}`;
    const objectKey = `specs/${sha256}`;
    await db.query(
      'INSERT INTO "Version" (id, "organizationId", "docId", "branchId", "sequenceNumber", sha256, "sourceFormat", "rawSpecObjectKey", status, "validationSummary", "createdByUserId", "createdAt", "readyAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())',
      [versionId, orgId, docId, branchId, nextSeq, sha256, "openapi", objectKey, "ready", JSON.stringify({}), session.userId]
    );

    const artifactId = `art_${crypto.randomUUID().slice(0, 8)}`;
    await db.query(
      'INSERT INTO "VersionArtifact" (id, "organizationId", "versionId", kind, "objectKey", "contentSha256", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [artifactId, orgId, versionId, "normalized_spec", `normalized/${filename}`, sha256]
    );

    await db.query('UPDATE "Doc" SET "defaultBranchId" = $1 WHERE id = $2 AND "defaultBranchId" IS NULL', [branchId, docId]);
  }

  redirect(`/app/${org}/docs/${docSlug}`);
}
