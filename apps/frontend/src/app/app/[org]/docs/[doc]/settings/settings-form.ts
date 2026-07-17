import type { DbBranchMapping, DbGithubInstallation, DbGithubRepository } from "@/entities/dashboard";
import { styledHtmlPage } from "@/shared/ui/styled-html";

export function settingsForm(input: {
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

  let githubSection = "";
  if (linkedRepo) {
    const mappingItems = mappings
      .map(
        (m) => `
        <div class="mb-2 flex items-center justify-between rounded-lg border border-chalk bg-fog p-2.5 text-sm">
          <div>
            <strong>${escapeHtml(m.branchName)}</strong> &rarr; <code>${escapeHtml(m.specPath)}</code>
          </div>
          <div class="flex items-center gap-3">
            ${showSimulate ? `
            <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="inline">
              <input type="hidden" name="action" value="trigger_push">
              <input type="hidden" name="mappingId" value="${escapeHtml(m.id)}">
              <button type="submit" title="Deploy a mock OpenAPI spec instantly" class="inline-flex min-h-7 items-center rounded-full bg-carbon px-3 text-xs font-medium text-paper">Simulate Push</button>
            </form>
            <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="inline">
              <input type="hidden" name="action" value="trigger_webhook">
              <input type="hidden" name="mappingId" value="${escapeHtml(m.id)}">
              <button type="submit" title="Trigger a webhook call to fetch the live spec file from GitHub" class="inline-flex min-h-7 items-center rounded-full bg-blue-700 px-3 text-xs font-medium text-paper">Simulate Webhook</button>
            </form>
            ` : ""}
            <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="inline">
              <input type="hidden" name="action" value="delete_mapping">
              <input type="hidden" name="mappingId" value="${escapeHtml(m.id)}">
              <button type="submit" class="bg-transparent p-0 text-sm font-semibold text-red-700">Delete</button>
            </form>
          </div>
        </div>`
      )
      .join("");

    githubSection = `
      <div class="mt-8 border-t border-chalk pt-8">
        <h2>GitHub Integration</h2>
        <p class="mb-4 text-sm text-graphite">
          Linked Repository: <strong>${escapeHtml(linkedRepo.fullName)}</strong>
        </p>
        <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="mb-6">
          <input type="hidden" name="action" value="unlink_repo">
          <input type="hidden" name="repoId" value="${escapeHtml(linkedRepo.id)}">
          <button type="submit" class="inline-flex min-h-9 items-center rounded-full bg-carbon px-4 text-sm text-paper">Unlink Repository</button>
        </form>

        <h3 class="mb-2 text-base font-semibold">Branch & Spec Path Mappings</h3>
        <p class="mb-3 text-sm text-slate">Map repository branches to trigger automatic deployments from pushes or pull requests.</p>
        
        ${mappingItems || '<p class="text-sm italic text-slate">No branch mappings configured.</p>'}

        <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="mt-4 rounded-lg border border-dashed border-chalk bg-fog p-4">
          <input type="hidden" name="action" value="create_mapping">
          <input type="hidden" name="githubRepoId" value="${escapeHtml(linkedRepo.githubRepoId)}">
          <div class="mb-3 grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col text-sm font-semibold">
              Git Branch
              <select name="branchName" required class="mt-1.5 rounded-lg border border-chalk bg-paper p-2 text-sm">
                ${availableBranches.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("")}
              </select>
            </label>
            <label class="flex flex-col text-sm font-semibold">
              Spec Path
              <input name="specPath" placeholder="openapi.yaml" required class="mt-1.5 rounded-lg border border-chalk px-3 py-2 text-sm">
            </label>
          </div>
          <button type="submit" class="inline-flex min-h-9 items-center rounded-full bg-carbon px-4 text-sm text-paper">Add Branch Mapping</button>
        </form>
      </div>`;
  } else {
    const repoOptions = unlinkedRepos
      .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.fullName)}</option>`)
      .join("");
 
    const linkExistingForm = unlinkedRepos.length > 0
      ? `
      <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="mb-6">
        <input type="hidden" name="action" value="link_repo">
        <label>Link existing organization repository
          <select name="repoId" required class="mt-1.5">
            ${repoOptions}
          </select>
        </label>
        <button type="submit" class="mt-2.5 inline-flex min-h-9 items-center rounded-full bg-carbon px-4 text-sm text-paper">Link Selected Repository</button>
      </form>`
      : '<p class="text-sm italic text-slate">No unlinked organization repositories found.</p>';
 
    const installationOptions = installations
      .map((i) => `<option value="${escapeHtml(i.githubInstallationId)}">${escapeHtml(i.accountName)} (${escapeHtml(i.githubInstallationId)})</option>`)
      .join("");
 
    const linkNewForm = showSimulate
      ? `
      <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="mt-4 rounded-lg border border-dashed border-chalk bg-fog p-4">
        <input type="hidden" name="action" value="create_and_link_repo">
        <h3 class="mb-3 text-sm font-semibold">Link new repository (Simulated)</h3>
        <div class="flex flex-col gap-3">
          <label>Installation Account
            <select name="githubInstallationId" required>
              ${installationOptions}
            </select>
          </label>
          <label>Repository Full Name (e.g. org/repo)
            <input name="fullName" placeholder="octo/payments" required class="px-3 py-2">
          </label>
        </div>
        <button type="submit" class="mt-3 inline-flex min-h-9 items-center rounded-full bg-carbon px-4 text-sm text-paper">Link New Repository</button>
      </form>`
      : (installations.length > 0 && availableRepos.length > 0
        ? `
        <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="mt-4 rounded-lg border border-dashed border-chalk bg-fog p-4">
          <input type="hidden" name="action" value="create_and_link_repo">
          <h3 class="mb-3 text-sm font-semibold">Link new repository</h3>
          <div class="flex flex-col gap-3">
            <label>Select Repository
              <select name="repoSelect" required class="mt-1.5 px-3 py-2">
                ${availableRepos.map(r => `<option value="${escapeHtml(r.githubInstallationId)}|${escapeHtml(r.githubRepoId)}|${escapeHtml(r.fullName)}">${escapeHtml(r.fullName)}</option>`).join("")}
              </select>
            </label>
          </div>
          <button type="submit" class="mt-3 inline-flex min-h-9 items-center rounded-full bg-carbon px-4 text-sm text-paper">Link New Repository</button>
          <a href="https://github.com/apps/${process.env["GITHUB_APP_NAME"] || 'bumd'}/installations/new?state=${escapeHtml(organizationSlug)}--${escapeHtml(docSlug)}" class="mt-3 inline-block text-sm text-blue-700 underline">
            Add or manage installations
          </a>
        </form>`
        : `<p class="mb-3 text-sm italic text-slate">No unlinked repositories found on active installations.</p>
           <a href="https://github.com/apps/${process.env["GITHUB_APP_NAME"] || 'bumd'}/installations/new?state=${escapeHtml(organizationSlug)}--${escapeHtml(docSlug)}" class="inline-block text-sm text-blue-700 underline">
             Add or manage installations
           </a>`);
 
    const connectButton = showSimulate
      ? `
      <form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" class="inline-block">
        <input type="hidden" name="action" value="simulate_installation">
        <button type="submit" class="inline-flex min-h-9 items-center rounded-full bg-carbon px-4 text-sm text-paper">
          Simulate GitHub App Installation
        </button>
      </form>`
      : `
      <a href="https://github.com/apps/${process.env["GITHUB_APP_NAME"] || 'bumd'}/installations/new?state=${escapeHtml(organizationSlug)}--${escapeHtml(docSlug)}" class="inline-flex min-h-9 items-center justify-center rounded-full bg-carbon px-4 text-sm font-medium text-paper">
        Connect GitHub App
      </a>`;
 
    githubSection = `
      <div class="mt-8 border-t border-chalk pt-8">
        <h2>GitHub Integration</h2>
        <p class="mb-4 text-sm text-graphite">Link a GitHub repository to enable pull request status checks, previews, and automated commit deployment.</p>
        ${installations.length === 0 ? connectButton : `
          ${linkExistingForm}
          ${linkNewForm}
        `}
      </div>`;
  }

  const content = `<h1>Settings</h1>${error === null ? "" : `<p class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">${escapeHtml(error)}</p>`}<form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings"><label>Visibility <select name="visibility"><option value="public"${visibility === "public" ? " selected" : ""}>public</option><option value="private"${visibility === "private" ? " selected" : ""}>private</option></select></label><label>Theme <input name="theme" value="${escapeHtml(theme)}" required></label><button type="submit">Save settings</button></form>${githubSection}<div class="mt-8 border-t border-chalk pt-8"><h2 class="mb-3 text-red-700">Danger Zone</h2><p class="mb-4 text-sm text-graphite">Permanently delete this documentation portal, including all of its immutable versions, changelog diffs, and settings.</p><form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings" onsubmit="return confirm('Are you sure you want to delete this document portal? This action is permanent and cannot be undone.');"><input type="hidden" name="action" value="delete"><button type="submit" class="inline-flex min-h-10 items-center rounded-full bg-red-700 px-5 font-medium text-paper">Delete documentation portal</button></form></div><a href="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}" class="mt-8 block">Back to Overview</a>`;
  return styledHtmlPage("Settings", `${organizationSlug} / ${docSlug}`, content);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
