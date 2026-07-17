import { MembershipRole } from "@/shared/auth/rbac";
import { requireOrgRole } from "@/shared/auth/session";

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
