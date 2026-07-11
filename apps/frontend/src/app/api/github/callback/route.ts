import { redirect } from "next/navigation";
import { getDb } from "@/shared/db";
import { getInstallationDetails } from "@/shared/github-app";
import { randomUUID } from "node:crypto";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");

  if (!installationId || !state) {
    return new Response("Missing installation_id or state", { status: 400 });
  }

  const [orgSlug, docSlug] = state.split("--");
  if (!orgSlug || !docSlug) {
    return new Response("Invalid state parameter", { status: 400 });
  }

  const appId = process.env["GITHUB_APP_ID"];
  const privateKey = process.env["GITHUB_APP_PRIVATE_KEY"];

  if (!appId || !privateKey) {
    return new Response("GitHub App is not configured on this server (missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY)", { status: 500 });
  }

  try {
    const { accountName } = await getInstallationDetails(appId, privateKey, installationId);

    const db = getDb();
    const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [orgSlug]);
    if (orgRes.rows.length === 0) {
      return new Response("Organization not found", { status: 404 });
    }
    const orgId = orgRes.rows[0].id;

    const id = `ghinst_${randomUUID()}`;
    await db.query(
      `INSERT INTO "GithubInstallation" (id, "organizationId", "githubInstallationId", "accountName", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT ("githubInstallationId") DO UPDATE SET "accountName" = EXCLUDED."accountName", "updatedAt" = NOW()`,
      [id, orgId, installationId, accountName]
    );
  } catch (error: any) {
    console.error("GitHub App callback error:", error);
    return new Response(`Failed to complete GitHub App installation: ${error.message || error}`, { status: 500 });
  }

  redirect(`/app/${orgSlug}/docs/${docSlug}/settings`);
}
