import { getCurrentSession, getMembershipForOrg } from "@/shared/auth/rbac";

export async function hasPortalSession(): Promise<boolean> {
  return (await getCurrentSession()) !== null;
}

export async function hasPortalAccess(organizationSlug: string): Promise<boolean> {
  return (await getMembershipForOrg(organizationSlug)) !== null;
}

export { getCurrentSession, getMembershipForOrg, requireOrgRole, requireUserSession } from "@/shared/auth/rbac";
