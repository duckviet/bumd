import { notFound, redirect } from "next/navigation";
import { getDashboardDoc, updateDashboardDocSettings, deleteDashboardDoc } from "@/entities/dashboard";
import { requireDashboardManage } from "@/shared/auth/dashboard-access";
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
  createAndLinkRepository,
  simulateGithubPush,
  upsertGithubInstallation,
  type DbGithubRepository,
  type DbGithubInstallation,
  type DbBranchMapping,
} from "@/entities/dashboard";
import { randomUUID } from "node:crypto";
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

  const docId = doc.id;

  const linkedRepo = await getLinkedRepoForDoc(org, docId);
  const installations = await listOrgInstallations(org);
  const mappings = await listDocMappings(org, docId);
  const availableRepos = await getAvailableRepositories(installations);

  const unlinkedRepos = (await listOrgRepos(org)).filter((repo) => repo.docId === null);

  const appId = process.env["GITHUB_APP_ID"];
  const privateKey = process.env["GITHUB_APP_PRIVATE_KEY"];
  const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
  const isValidKey = !!(privateKey && privateKey.includes("-----BEGIN") && !isTest);
  const showSimulate = !isValidKey;

  let availableBranches: string[] = ["main", "master"];
  if (linkedRepo) {
    if (!showSimulate && appId && privateKey) {
      try {
        const branches = await listRepositoryBranches(appId, privateKey, linkedRepo.githubInstallationId, linkedRepo.fullName);
        if (branches && branches.length > 0) {
          availableBranches = branches;
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

  const docId = doc.id;

  const form = await request.formData();
  const action = form.get("action");

  if (action === "simulate_installation") {
    const isProduction = process.env["NODE_ENV"] === "production";
    const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
    if (isProduction && !isTest) {
      return new Response("Simulate actions are not allowed in production", { status: 403 });
    }
    await upsertGithubInstallation(org, `inst_${randomUUID().slice(0, 8)}`, `octo-${org}`);
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "trigger_push") {
    const isProduction = process.env["NODE_ENV"] === "production";
    const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
    if (isProduction && !isTest) {
      return new Response("Simulate actions are not allowed in production", { status: 403 });
    }
    const mappingId = stringValue(form.get("mappingId"));
    if (mappingId) await simulateGithubPush(org, mappingId);
    redirect(`/app/${org}/docs/${docSlug}/settings`);
  }

  if (action === "trigger_webhook") {
    const isProduction = process.env["NODE_ENV"] === "production";
    const isTest = !!process.env["BUMD_AUTH_TEST_INVITES"];
    if (isProduction && !isTest) {
      return new Response("Simulate actions are not allowed in production", { status: 403 });
    }
    const mappingId = stringValue(form.get("mappingId"));
    if (mappingId) await simulateGithubPush(org, mappingId);
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
      await createAndLinkRepository(org, docId, { githubInstallationId: installationId, githubRepoId: finalRepoId, fullName });
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

      const created = (await listDocMappings(org, docId)).find((mapping) => mapping.githubRepoId === githubRepoId && mapping.branchName === branchName && mapping.specPath === specPath);
      if (created) await simulateGithubPush(org, created.id);
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

    const unlinkedRepos = (await listOrgRepos(org)).filter((repo) => repo.docId === null);

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
