import { notFound, redirect } from "next/navigation";
import { getDashboardDoc, updateDashboardDocSettings, deleteDashboardDoc } from "@/entities/dashboard";
import { requireDashboardManage } from "@/app/app/[org]/docs/dashboard-helpers";
import { settingsForm } from "@/app/app/[org]/docs/[doc]/settings/settings-form";
import {
  getLinkedRepoForDoc,
  listOrgInstallations,
  listOrgRepos,
  linkRepoToDoc,
  unlinkRepoFromDoc,
  listDocMappings,
  createDocMapping,
  deleteDocMapping,
  type DbGithubRepository,
  type DbGithubInstallation,
  type DbBranchMapping,
} from "@/entities/dashboard";
import { getDb } from "@/shared/db";
import { randomUUID, createHmac } from "node:crypto";
import { backendBaseUrl } from "@/shared/config/env";
import { listInstallationRepositories, listRepositoryBranches } from "@/shared/github-app";

async function getAvailableRepositories(installations: readonly DbGithubInstallation[]): Promise<Array<{ githubInstallationId: string; githubRepoId: string; fullName: string }>> {
  const availableRepos: Array<{ githubInstallationId: string; githubRepoId: string; fullName: string }> = [];
  const appId = process.env["GITHUB_APP_ID"];
  const privateKey = process.env["GITHUB_APP_PRIVATE_KEY"];
  const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
  const isValidKey = !!(privateKey && privateKey.includes("-----BEGIN") && !isTest);

  if (appId && isValidKey) {
    for (const inst of installations) {
      try {
        const repos = await listInstallationRepositories(appId, privateKey, inst.githubInstallationId);
        for (const r of repos) {
          availableRepos.push({
            githubInstallationId: inst.githubInstallationId,
            githubRepoId: String(r.id),
            fullName: r.full_name,
          });
        }
      } catch (error) {
        console.error(`Failed to load repositories for installation ${inst.githubInstallationId}:`, error);
      }
    }
  }

  if (!isValidKey) {
    availableRepos.push({
      githubInstallationId: "inst_001",
      githubRepoId: "998877",
      fullName: "octo/linked-repo-test",
    });
  }
  return availableRepos;
}

type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { org, doc: docSlug } = await context.params;
  await requireDashboardManage(org);
  const doc = await getDashboardDoc(org, docSlug);
  if (doc === null) {
    notFound();
  }

  const db = getDb();
  const docIdRes = await db.query(
    `SELECT d.id FROM "Doc" d
     INNER JOIN "Organization" o ON o.id = d."organizationId"
     WHERE o.slug = $1 AND d.slug = $2`,
    [org, docSlug]
  );
  if (docIdRes.rows.length === 0) {
    notFound();
  }
  const docId = docIdRes.rows[0].id as string;

  const linkedRepo = await getLinkedRepoForDoc(org, docId);
  const installations = await listOrgInstallations(org);
  const mappings = await listDocMappings(org, docId);
  const availableRepos = await getAvailableRepositories(installations);

  const unlinkedRes = await db.query(
    `SELECT r.id, r."githubRepoId", r."fullName"
     FROM "GithubRepository" r
     INNER JOIN "Organization" o ON o.id = r."organizationId"
     WHERE o.slug = $1 AND (r."docId" IS NULL OR r."docId" = '')`,
    [org]
  );
  const unlinkedRepos = unlinkedRes.rows.map((row) => ({
    id: row.id,
    githubRepoId: row.githubRepoId,
    fullName: row.fullName,
  }));

  const appId = process.env["GITHUB_APP_ID"];
  const privateKey = process.env["GITHUB_APP_PRIVATE_KEY"];
  const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
  const isValidKey = !!(privateKey && privateKey.includes("-----BEGIN") && !isTest);
  const showSimulate = !isValidKey;

  let availableBranches: string[] = ["main", "master"];
  if (linkedRepo) {
    if (!showSimulate && appId && privateKey) {
      try {
        const repoRes = await db.query(
          `SELECT "githubInstallationId" FROM "GithubRepository" WHERE "id" = $1`,
          [linkedRepo.id]
        );
        if (repoRes.rows.length > 0) {
          const githubInstallationId = repoRes.rows[0].githubInstallationId;
          const branches = await listRepositoryBranches(appId, privateKey, githubInstallationId, linkedRepo.fullName);
          if (branches && branches.length > 0) {
            availableBranches = branches;
          }
        }
      } catch (err) {
        console.error("Failed to fetch branches for settings dropdown:", err);
      }
    } else {
      availableBranches = ["main", "master", "develop", "feature/new-api"];
    }
  }

  return htmlResponse(
    settingsForm({
      organizationSlug: org,
      docSlug: doc.slug,
      docId: docId,
      visibility: doc.visibility,
      theme: doc.theme,
      error: null,
      linkedRepo,
      availableRepos,
      unlinkedRepos,
      installations,
      mappings,
      showSimulate,
      availableBranches,
    })
  );
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { org, doc: docSlug } = await context.params;
  await requireDashboardManage(org);
  const doc = await getDashboardDoc(org, docSlug);
  if (doc === null) {
    notFound();
  }

  const db = getDb();
  const docIdRes = await db.query(
    `SELECT d.id FROM "Doc" d
     INNER JOIN "Organization" o ON o.id = d."organizationId"
     WHERE o.slug = $1 AND d.slug = $2`,
    [org, docSlug]
  );
  if (docIdRes.rows.length === 0) {
    notFound();
  }
  const docId = docIdRes.rows[0].id as string;

  const form = await request.formData();
  const action = form.get("action");

  if (action === "simulate_installation") {
    const isProduction = process.env["NODE_ENV"] === "production";
    const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
    if (isProduction && !isTest) {
      return new Response("Simulate actions are not allowed in production", { status: 403 });
    }
    const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [org]);
    const orgId = orgRes.rows[0]?.id;
    if (orgId) {
      const id = `ghinst_${randomUUID()}`;
      const randomInstId = `inst_${randomUUID().slice(0, 8)}`;
      await db.query(
        `INSERT INTO "GithubInstallation" (id, "organizationId", "githubInstallationId", "accountName", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT ("githubInstallationId") DO NOTHING`,
        [id, orgId, randomInstId, `octo-${org}`]
      );
    }
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "trigger_push") {
    const isProduction = process.env["NODE_ENV"] === "production";
    const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
    if (isProduction && !isTest) {
      return new Response("Simulate actions are not allowed in production", { status: 403 });
    }
    const mappingId = stringValue(form.get("mappingId"));
    if (mappingId) {
      const mapRes = await db.query(
        `SELECT m."branchName", m."specPath", m."githubRepoId", d.slug as "docSlug"
         FROM "GithubRepoBranchMapping" m
         INNER JOIN "Doc" d ON d.id = m."docId"
         WHERE m.id = $1`,
        [mappingId]
      );
      if (mapRes.rows.length > 0) {
        const { branchName, specPath, docSlug: targetDocSlug } = mapRes.rows[0];
        
        const mockSpec = `openapi: 3.0.0
info:
  title: Simulated GitHub API (${branchName})
  version: ${String(Math.floor(1000 + Math.random() * 9000))}
paths:
  /hello-${branchName}:
    get:
      summary: Simulated endpoint for spec at ${specPath}
      responses:
        '200':
          description: OK`;
          
        const fileBase64 = Buffer.from(mockSpec, "utf8").toString("base64");
        
        const adminToken = process.env["BUMD_ADMIN_SESSION_TOKEN"];
        if (!adminToken || adminToken.trim() === "") {
          if (process.env["NODE_ENV"] === "production") {
            throw new Error("BUMD_ADMIN_SESSION_TOKEN environment variable is not configured");
          }
        }
        const finalAdminToken = adminToken || "test_admin_session_not_secret";

        const tokenRes = await fetch(`${backendBaseUrl()}/v1/orgs/${org}/api-tokens`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${finalAdminToken}`,
          },
          body: JSON.stringify({
            name: `web-simulated-push-${Date.now()}`,
            role: "member",
            scopes: ["docs:deploy"],
          }),
        });
        
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          const apiToken = tokenData.token;
          
          await fetch(`${backendBaseUrl()}/v1/orgs/${org}/docs/${targetDocSlug}/branches/${branchName}/deploys`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiToken}`,
            },
            body: JSON.stringify({
              orgSlug: org,
              docSlug: targetDocSlug,
              branchSlug: branchName,
              filename: "openapi.yaml",
              sourceFormat: "openapi",
              specBase64: fileBase64,
            }),
          });
        }
      }
    }
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "trigger_webhook") {
    const isProduction = process.env["NODE_ENV"] === "production";
    const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
    if (isProduction && !isTest) {
      return new Response("Simulate actions are not allowed in production", { status: 403 });
    }
    const mappingId = stringValue(form.get("mappingId"));
    if (mappingId) {
      const mapRes = await db.query(
        `SELECT m."branchName", m."specPath", m."githubRepoId", r."fullName", d.slug as "docSlug"
         FROM "GithubRepoBranchMapping" m
         INNER JOIN "GithubRepository" r ON r."githubRepoId" = m."githubRepoId"
         INNER JOIN "Doc" d ON d.id = m."docId"
         WHERE m.id = $1`,
        [mappingId]
      );
      if (mapRes.rows.length > 0) {
        const { branchName, specPath, githubRepoId, fullName, docSlug: targetDocSlug } = mapRes.rows[0];
        
        // Build mock payload
        const payloadObj = {
          ref: `refs/heads/${branchName}`,
          after: "main",
          repository: {
            id: Number(githubRepoId),
            full_name: fullName,
          },
        };
        const rawBody = JSON.stringify(payloadObj);
        
        // Sign payload
        const secret = process.env["GITHUB_WEBHOOK_SECRET"] || "";
        const signature = `sha256=${createHmac("sha256", secret).update(Buffer.from(rawBody, "utf8")).digest("hex")}`;
        
        await fetch(`${backendBaseUrl()}/v1/github/webhooks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Github-Event": "push",
            "X-Hub-Signature-256": signature,
          },
          body: rawBody,
        });
      }
    }
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "delete") {
    const deleteResult = await deleteDashboardDoc(org, docSlug);
    if (deleteResult.kind === "missing") {
      notFound();
    }
    redirect(`/app/${org}`);
  }

  if (action === "link_repo") {
    const repoId = stringValue(form.get("repoId"));
    if (repoId) {
      await linkRepoToDoc(org, docId, repoId);
    }
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "create_and_link_repo") {
    let installationId = stringValue(form.get("githubInstallationId"));
    let repoId = stringValue(form.get("githubRepoId"));
    let fullName = stringValue(form.get("fullName"));

    const repoSelect = stringValue(form.get("repoSelect"));
    if (repoSelect) {
      const parts = repoSelect.split("|");
      if (parts.length === 3) {
        installationId = parts[0] || "";
        repoId = parts[1] || "";
        fullName = parts[2] || "";
      }
    }

    if (installationId && fullName) {
      const appId = process.env["GITHUB_APP_ID"];
      const privateKey = process.env["GITHUB_APP_PRIVATE_KEY"];
      const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
      const isValidKey = !!(privateKey && privateKey.includes("-----BEGIN") && !isTest);
      const isMock = !isValidKey;

      const finalRepoId = repoId || (isMock ? `mock_${randomUUID().slice(0, 8)}` : String(Math.floor(100000 + Math.random() * 900000)));
      const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [org]);
      const orgId = orgRes.rows[0]?.id;
      if (orgId) {
        const id = `ghrepo_${randomUUID()}`;
        await db.query(
          `INSERT INTO "GithubRepository" (id, "organizationId", "githubInstallationId", "githubRepoId", "fullName", "docId", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT ("githubRepoId") DO UPDATE SET "docId" = $6`,
          [id, orgId, installationId, finalRepoId, fullName, docId]
        );
      }
    }
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "unlink_repo") {
    const repoId = stringValue(form.get("repoId"));
    if (repoId) {
      await unlinkRepoFromDoc(org, repoId);
    }
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "create_mapping") {
    const githubRepoId = stringValue(form.get("githubRepoId"));
    const branchName = stringValue(form.get("branchName"));
    const specPath = stringValue(form.get("specPath"));

    if (githubRepoId && branchName && specPath) {
      await createDocMapping(org, docId, githubRepoId, branchName, specPath);

      // Trigger automatic initial deploy of this newly added mapping by calling webhook receiver
      const repoRes = await db.query(
        `SELECT "githubInstallationId", "fullName" FROM "GithubRepository" WHERE "githubRepoId" = $1 AND "organizationId" = (SELECT id FROM "Organization" WHERE slug = $2)`,
        [githubRepoId, org]
      );
      if (repoRes.rows.length > 0) {
        const { githubInstallationId, fullName } = repoRes.rows[0];
        
        // Build payload targeting the branch
        const payloadObj = {
          ref: `refs/heads/${branchName}`,
          after: branchName,
          repository: {
            id: Number(githubRepoId),
            full_name: fullName,
          },
          installation: {
            id: Number(githubInstallationId),
          },
        };
        const rawBody = JSON.stringify(payloadObj);
        
        const secret = process.env["GITHUB_WEBHOOK_SECRET"] || "";
        const signature = `sha256=${createHmac("sha256", secret).update(Buffer.from(rawBody, "utf8")).digest("hex")}`;
        
        try {
          await fetch(`${backendBaseUrl()}/v1/github/webhooks`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Github-Event": "push",
              "X-Hub-Signature-256": signature,
            },
            body: rawBody,
          });
        } catch (err) {
          console.error("Failed to trigger initial deploy for new mapping:", err);
        }
      }
    }
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "delete_mapping") {
    const mappingId = stringValue(form.get("mappingId"));
    if (mappingId) {
      await deleteDocMapping(org, mappingId);
    }
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  // Fallback: Save doc visibility and theme settings
  const result = await updateDashboardDocSettings(org, docSlug, {
    visibility: stringValue(form.get("visibility")),
    theme: stringValue(form.get("theme")),
  });
  if (result.kind === "missing") {
    notFound();
  }
  if (result.kind === "invalid") {
    const linkedRepo = await getLinkedRepoForDoc(org, docId);
    const installations = await listOrgInstallations(org);
    const mappings = await listDocMappings(org, docId);
    const availableRepos = await getAvailableRepositories(installations);

    const unlinkedRes = await db.query(
      `SELECT r.id, r."githubRepoId", r."fullName"
       FROM "GithubRepository" r
       INNER JOIN "Organization" o ON o.id = r."organizationId"
       WHERE o.slug = $1 AND (r."docId" IS NULL OR r."docId" = '')`,
      [org]
    );
    const unlinkedRepos = unlinkedRes.rows.map((row) => ({
      id: row.id,
      githubRepoId: row.githubRepoId,
      fullName: row.fullName,
    }));

    const appId = process.env["GITHUB_APP_ID"];
    const privateKey = process.env["GITHUB_APP_PRIVATE_KEY"];
    const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
    const isValidKey = !!(privateKey && privateKey.includes("-----BEGIN") && !isTest);
    const showSimulate = !isValidKey;

    return htmlResponse(
      settingsForm({
        organizationSlug: org,
        docSlug: doc.slug,
        docId: docId,
        visibility: doc.visibility,
        theme: doc.theme,
        error: "invalid",
        linkedRepo,
        availableRepos,
        unlinkedRepos,
        installations,
        mappings,
        showSimulate,
      }),
      400
    );
  }
  redirect(`/app/${org}/docs/${docSlug}`);
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
