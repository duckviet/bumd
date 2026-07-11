import { redirect } from "next/navigation";
import { MembershipRole, type Membership } from "@/shared/auth/auth-store";
import { requireOrgRole } from "@/shared/auth/session";
import { OrgSwitcher } from "@/app/app/[org]/docs/org-switcher";

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
  readonly memberships?: readonly Membership[];
  readonly tab?: "overview" | "portals" | "members" | "api-tokens" | "webhooks";
  readonly children: React.ReactNode;
}): React.ReactElement {
  const activeTab = input.tab ?? "overview";
  return (
    <main className="min-h-[100dvh] bg-fog text-carbon">
      <header className="border-b border-chalk bg-paper px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-center gap-6">
          <a href="/app" className="flex items-center gap-1.5 hover:opacity-90">
            <span className="font-polysans text-2xl font-bold tracking-tight text-carbon">
              ventriloc<span className="text-signal-orange">.</span>
            </span>
          </a>
          <div className="h-6 w-px bg-chalk" />
          <div>
            {input.memberships && input.memberships.length > 0 ? (
              <div className="mb-1.5">
                <OrgSwitcher currentOrg={input.organizationSlug} memberships={input.memberships} />
              </div>
            ) : (
              <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">{input.organizationSlug}</p>
            )}
            <h1>Documentation dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-sm text-graphite">
            <span>{input.email}</span>
            <strong>{input.role}</strong>
          </div>
          <form action="/logout" method="post" className="m-0">
            <button type="submit" className="border-carbon bg-transparent text-carbon hover:bg-chalk text-sm h-9 px-4 rounded-full border border-chalk hover:bg-chalk transition-all">
              Log out
            </button>
          </form>
        </div>
      </header>
      <nav className="mx-auto mt-4 flex max-w-7xl gap-1.5 overflow-x-auto pb-2.5">
        <a href={`/app/${input.organizationSlug}`} className={activeTab === "overview" ? "active" : ""}>Overview</a>
        <a href={`/app/${input.organizationSlug}/docs`} className={activeTab === "portals" ? "active" : ""}>Portals</a>
        <a href={`/app/${input.organizationSlug}/members`} className={activeTab === "members" ? "active" : ""}>Members & Invites</a>
        <a href={`/app/${input.organizationSlug}/api-tokens`} className={activeTab === "api-tokens" ? "active" : ""}>API Tokens</a>
        <a href={`/app/${input.organizationSlug}/webhooks`} className={activeTab === "webhooks" ? "active" : ""}>Webhooks</a>
      </nav>
      {input.children}
    </main>
  );
}
