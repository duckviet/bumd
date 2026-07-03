import { redirect } from "next/navigation";
import { MembershipRole } from "../../../../shared/auth/auth-store";
import { requireOrgRole } from "../../../../shared/auth/session";

export const ManageRoles = [MembershipRole.Owner, MembershipRole.Admin, MembershipRole.Member] as const;
export const ReadRoles = [MembershipRole.Owner, MembershipRole.Admin, MembershipRole.Member, MembershipRole.Guest] as const;

export async function requireDashboardRead(organizationSlug: string) {
  return requireOrgRole(organizationSlug, ReadRoles);
}

export async function requireDashboardManage(organizationSlug: string) {
  return requireOrgRole(organizationSlug, ManageRoles);
}

export function canManage(role: MembershipRole): boolean {
  switch (role) {
    case MembershipRole.Owner:
    case MembershipRole.Admin:
    case MembershipRole.Member:
      return true;
    case MembershipRole.Guest:
      return false;
  }
}

export function redirectToDocs(organizationSlug: string): never {
  redirect(`/app/${organizationSlug}/docs`);
}

export function dashboardShell(input: {
  readonly organizationSlug: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly tab?: "overview" | "portals";
  readonly children: React.ReactNode;
}): React.ReactElement {
  const activeTab = input.tab ?? "overview";
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="flex items-center gap-6">
          <a href="/app" className="flex items-center gap-1.5 hover:opacity-90">
            <span className="font-polysans text-2xl font-bold tracking-tight text-carbon">
              ventriloc<span className="text-signal-orange">.</span>
            </span>
          </a>
          <div className="h-6 w-px bg-chalk" />
          <div>
            <p className="dashboard-kicker">{input.organizationSlug}</p>
            <h1>Documentation dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="dashboard-user">
            <span>{input.email}</span>
            <strong>{input.role}</strong>
          </div>
          <form action="/logout" method="post" className="m-0">
            <button type="submit" className="button-secondary text-sm h-9 px-4 rounded-full border border-chalk hover:bg-chalk transition-all">
              Log out
            </button>
          </form>
        </div>
      </header>
      <nav className="dashboard-tabs">
        <a href={`/app/${input.organizationSlug}`} className={activeTab === "overview" ? "active" : ""}>Overview</a>
        <a href={`/app/${input.organizationSlug}/docs`} className={activeTab === "portals" ? "active" : ""}>Portals</a>
      </nav>
      {input.children}
    </main>
  );
}
