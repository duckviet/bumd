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
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-kicker">{input.organizationSlug}</p>
          <h1>Documentation dashboard</h1>
        </div>
        <div className="dashboard-user">
          <span>{input.email}</span>
          <strong>{input.role}</strong>
        </div>
      </header>
      <nav className="dashboard-tabs">
        <a href={`/app/${input.organizationSlug}/docs`}>Docs</a>
      </nav>
      {input.children}
    </main>
  );
}
