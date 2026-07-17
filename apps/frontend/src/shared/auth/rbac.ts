import { redirect } from "next/navigation";
import { currentDashboardUser, type DashboardMembership, type DashboardMembershipRole } from "@/shared/auth/dashboard-auth-client";
import { dashboardCredentials } from "@/shared/auth/dashboard-credentials";

export const MembershipRole = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
  Guest: "guest",
} as const;

export type MembershipRole = DashboardMembershipRole;
export type Membership = DashboardMembership & { readonly userId: string };

export type CurrentSession = {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly memberships: readonly Membership[];
};

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const credentials = await dashboardCredentials();
  if (credentials === null) {
    return null;
  }
  const current = await currentDashboardUser(credentials.dashboardAccessCredential);
  if (current === null) {
    return null;
  }
  return {
    userId: current.user.id,
    email: current.user.email,
    name: current.user.name,
    memberships: current.memberships.map((membership) => ({ ...membership, userId: current.user.id })),
  };
}

export async function requireUserSession(callbackUrl = "/app"): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (session === null) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return session;
}

export async function requireOrgRole(organizationSlug: string, allowedRoles: readonly MembershipRole[]): Promise<{
  readonly session: CurrentSession;
  readonly membership: Membership;
}> {
  const session = await requireUserSession(`/app/${organizationSlug}`);
  const membership = session.memberships.find((candidate) => candidate.organizationSlug === organizationSlug) ?? null;
  if (membership === null || !allowedRoles.includes(membership.role)) {
    redirect("/app");
  }
  return { session, membership };
}

export async function getMembershipForOrg(organizationSlug: string): Promise<Membership | null> {
  const session = await getCurrentSession();
  if (session === null) {
    return null;
  }
  return session.memberships.find((candidate) => candidate.organizationSlug === organizationSlug) ?? null;
}
