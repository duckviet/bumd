import { notFound, redirect } from "next/navigation";
import { getDashboardDoc, updateDashboardDocSettings, deleteDashboardDoc } from "@/entities/dashboard";
import { requireDashboardManage } from "@/app/app/[org]/docs/dashboard-helpers";
import { styledHtmlPage } from "@/shared/ui/styled-html";
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

function settingsForm(input: {
  readonly organizationSlug: string;
  readonly docSlug: string;
  readonly docId: string;
  readonly visibility: string;
  readonly theme: string;
  readonly error: string | null;
  readonly linkedRepo: DbGithubRepository | null;
  readonly availableRepos: ReadonlyArray<{ githubInstallationId: string; githubRepoId: string; fullName: string }>;
  readonly unlinkedRepos: ReadonlyArray<{ id: string; githubRepoId: string; fullName: string }>;
  readonly installations: readonly DbGithubInstallation[];
  readonly mappings: readonly DbBranchMapping[];
  readonly showSimulate: boolean;
  readonly availableBranches?: readonly string[];
}): string {
  const { organizationSlug, docSlug, visibility, theme, error, linkedRepo, availableRepos, unlinkedRepos, installations, mappings, showSimulate, availableBranches = ["main", "master"] } = input;

  // Build GitHub Link UI
  let githubSection = "";
  if (linkedRepo) {
    const mappingItems = mappings
      .map(
        (m) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--color-chalk); border-radius: 8px; margin-bottom: 8px; font-size: 14px; background: var(--color-fog);">
          <div>
            <strong>${escapeHtml(m.branchName)}</strong> &rarr; <code>${escapeHtml(m.specPath)}</code>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            ${showSimulate ? `
            <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="margin: 0; display: inline;">
              <input type="hidden" name="action" value="trigger_push">
              <input type="hidden" name="mappingId" value="${escapeHtml(m.id)}">
              <button type="submit" title="Deploy a mock OpenAPI spec instantly" style="background-color: var(--color-carbon); color: white; border: none; border-radius: 20px; height: 28px; padding: 0 12px; cursor: pointer; font-size: 12px; margin: 0; font-weight: 500; font-family: var(--font-inter);">Simulate Push</button>
            </form>
            <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="margin: 0; display: inline;">
              <input type="hidden" name="action" value="trigger_webhook">
              <input type="hidden" name="mappingId" value="${escapeHtml(m.id)}">
              <button type="submit" title="Trigger a webhook call to fetch the live spec file from GitHub" style="background-color: #0066cc; color: white; border: none; border-radius: 20px; height: 28px; padding: 0 12px; cursor: pointer; font-size: 12px; margin: 0; font-weight: 500; font-family: var(--font-inter);">Simulate Webhook</button>
            </form>
            ` : ""}
            <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="margin: 0; display: inline;">
              <input type="hidden" name="action" value="delete_mapping">
              <input type="hidden" name="mappingId" value="${escapeHtml(m.id)}">
              <button type="submit" style="background: none; border: none; color: #d32f2f; cursor: pointer; font-size: 13px; font-weight: 600; height: auto; margin: 0; padding: 0;">Delete</button>
            </form>
          </div>
        </div>`
      )
      .join("");

    githubSection = `
      <div style="border-top: 1px solid var(--color-chalk); padding-top: 32px; margin-top: 32px;">
        <h2>GitHub Integration</h2>
        <p style="color: var(--color-graphite); font-size: 14px; margin-bottom: 16px;">
          Linked Repository: <strong>${escapeHtml(linkedRepo.fullName)}</strong>
        </p>
        <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="margin-bottom: 24px;">
          <input type="hidden" name="action" value="unlink_repo">
          <input type="hidden" name="repoId" value="${escapeHtml(linkedRepo.id)}">
          <button type="submit" style="background-color: var(--color-carbon); color: white; border: none; border-radius: 20px; height: 36px; padding: 0 16px; cursor: pointer; font-size: 13px;">Unlink Repository</button>
        </form>

        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Branch & Spec Path Mappings</h3>
        <p style="color: var(--color-slate); font-size: 13px; margin-bottom: 12px;">Map repository branches to trigger automatic deployments from pushes or pull requests.</p>
        
        ${mappingItems || '<p style="color: var(--color-slate); font-size: 13px; font-style: italic;">No branch mappings configured.</p>'}

        <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="margin-top: 16px; border: 1px dashed var(--color-chalk); padding: 16px; border-radius: 8px; background: #fafafa;">
          <input type="hidden" name="action" value="create_mapping">
          <input type="hidden" name="githubRepoId" value="${escapeHtml(linkedRepo.githubRepoId)}">
          <div style="display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-bottom: 12px;">
            <label style="display: flex; flex-direction: column; font-size: 13px; font-weight: 600;">
              Git Branch
              <select name="branchName" required style="margin-top: 6px; padding: 8px; border: 1px solid var(--color-chalk); border-radius: 6px; background: white; font-family: var(--font-inter); font-size: 14px;">
                ${availableBranches.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("")}
              </select>
            </label>
            <label style="display: flex; flex-direction: column; font-size: 13px; font-weight: 600;">
              Spec Path
              <input name="specPath" placeholder="openapi.yaml" required style="margin-top: 6px; padding: 8px 12px; border: 1px solid var(--color-chalk); border-radius: 6px; font-family: var(--font-inter); font-size: 14px;">
            </label>
          </div>
          <button type="submit" style="background-color: var(--color-carbon); color: white; border: none; border-radius: 20px; height: 36px; padding: 0 16px; cursor: pointer; font-size: 13px; margin: 0;">Add Branch Mapping</button>
        </form>
      </div>`;
  } else {
    // List unlinked repos
    const repoOptions = unlinkedRepos
      .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.fullName)}</option>`)
      .join("");
 
    const linkExistingForm = unlinkedRepos.length > 0
      ? `
      <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="margin-bottom: 24px;">
        <input type="hidden" name="action" value="link_repo">
        <label>Link existing organization repository
          <select name="repoId" required style="margin-top: 6px;">
            ${repoOptions}
          </select>
        </label>
        <button type="submit" style="background-color: var(--color-carbon); color: white; border: none; border-radius: 20px; height: 36px; padding: 0 16px; cursor: pointer; font-size: 13px; margin-top: 10px;">Link Selected Repository</button>
      </form>`
      : '<p style="color: var(--color-slate); font-size: 13px; font-style: italic;">No unlinked organization repositories found.</p>';
 
    const installationOptions = installations
      .map((i) => `<option value="${escapeHtml(i.githubInstallationId)}">${escapeHtml(i.accountName)} (${escapeHtml(i.githubInstallationId)})</option>`)
      .join("");
 
    const linkNewForm = showSimulate
      ? `
      <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="border: 1px dashed var(--color-chalk); padding: 16px; border-radius: 8px; margin-top: 16px; background: #fafafa;">
        <input type="hidden" name="action" value="create_and_link_repo">
        <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Link new repository (Simulated)</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <label>Installation Account
            <select name="githubInstallationId" required>
              ${installationOptions}
            </select>
          </label>
          <label>Repository Full Name (e.g. org/repo)
            <input name="fullName" placeholder="octo/payments" required style="padding: 8px 12px;">
          </label>
        </div>
        <button type="submit" style="background-color: var(--color-carbon); color: white; border: none; border-radius: 20px; height: 36px; padding: 0 16px; cursor: pointer; font-size: 13px; margin-top: 12px;">Link New Repository</button>
      </form>`
      : (installations.length > 0 && availableRepos.length > 0
        ? `
        <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="border: 1px dashed var(--color-chalk); padding: 16px; border-radius: 8px; margin-top: 16px; background: #fafafa;">
          <input type="hidden" name="action" value="create_and_link_repo">
          <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Link new repository</h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <label>Select Repository
              <select name="repoSelect" required style="padding: 8px 12px; margin-top: 6px;">
                ${availableRepos.map(r => `<option value="${escapeHtml(r.githubInstallationId)}|${escapeHtml(r.githubRepoId)}|${escapeHtml(r.fullName)}">${escapeHtml(r.fullName)}</option>`).join("")}
              </select>
            </label>
          </div>
          <button type="submit" style="background-color: var(--color-carbon); color: white; border: none; border-radius: 20px; height: 36px; padding: 0 16px; cursor: pointer; font-size: 13px; margin-top: 12px;">Link New Repository</button>
          <a href="https://github.com/apps/${process.env["GITHUB_APP_NAME"] || 'bumd'}/installations/new?state=${escapeHtml(organizationSlug)}--${escapeHtml(docSlug)}" style="color: #0066cc; font-size: 13px; text-decoration: underline; margin-top: 12px; display: inline-block;">
            Add or manage installations
          </a>
        </form>`
        : `<p style="color: var(--color-slate); font-size: 13px; font-style: italic; margin-bottom: 12px;">No unlinked repositories found on active installations.</p>
           <a href="https://github.com/apps/${process.env["GITHUB_APP_NAME"] || 'bumd'}/installations/new?state=${escapeHtml(organizationSlug)}--${escapeHtml(docSlug)}" style="color: #0066cc; font-size: 13px; text-decoration: underline; display: inline-block;">
             Add or manage installations
           </a>`);
 
    const connectButton = showSimulate
      ? `
      <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" style="display: inline-block; margin: 0;">
        <input type="hidden" name="action" value="simulate_installation">
        <button type="submit" style="background-color: var(--color-carbon); color: white; border: none; border-radius: 20px; height: 36px; padding: 0 16px; cursor: pointer; font-size: 13px; margin: 0;">
          Simulate GitHub App Installation
        </button>
      </form>`
      : `
      <a href="https://github.com/apps/${process.env["GITHUB_APP_NAME"] || 'bumd'}/installations/new?state=${escapeHtml(organizationSlug)}--${escapeHtml(docSlug)}" style="background-color: var(--color-carbon); color: white; border: none; border-radius: 20px; height: 36px; padding: 0 16px; cursor: pointer; font-size: 13px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; font-weight: 500; font-family: var(--font-inter);">
        Connect GitHub App
      </a>`;
 
    githubSection = `
      <div style="border-top: 1px solid var(--color-chalk); padding-top: 32px; margin-top: 32px;">
        <h2>GitHub Integration</h2>
        <p style="color: var(--color-graphite); font-size: 14px; margin-bottom: 16px;">Link a GitHub repository to enable pull request status checks, previews, and automated commit deployment.</p>
        ${installations.length === 0 ? connectButton : `
          ${linkExistingForm}
          ${linkNewForm}
        `}
      </div>`;
  }

  const content = `<h1>Settings</h1>${error === null ? "" : `<p class="error-msg">${escapeHtml(error)}</p>`}<form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings"><label>Visibility <select name="visibility"><option value="public"${visibility === "public" ? " selected" : ""}>public</option><option value="private"${visibility === "private" ? " selected" : ""}>private</option></select></label><label>Theme <input name="theme" value="${escapeHtml(theme)}" required></label><button type="submit">Save settings</button></form>${githubSection}<div style="border-top: 1px solid var(--color-chalk); padding-top: 32px; margin-top: 32px;"><h2 style="color: #d32f2f; margin-bottom: 12px;">Danger Zone</h2><p style="color: var(--color-graphite); font-size: 14px; margin-bottom: 16px;">Permanently delete this documentation portal, including all of its immutable versions, changelog diffs, and settings.</p><form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" onsubmit="return confirm('Are you sure you want to delete this document portal? This action is permanent and cannot be undone.');"><input type="hidden" name="action" value="delete"><button type="submit" style="background-color: #d32f2f; color: white; border: none; border-radius: 20px; height: 40px; padding: 0 20px; cursor: pointer; font-weight: 500; font-family: var(--font-inter);">Delete documentation portal</button></form></div><a href="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}" style="display: block; margin-top: 32px;">Back to Overview</a>`;
  return styledHtmlPage("Settings", `${organizationSlug} / ${docSlug}`, content);
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
