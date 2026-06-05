import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { getUserByEmail, membershipForOrg, membershipsForUser, type Membership, type MembershipRole } from "./auth-store";

export type CurrentSession = {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly memberships: readonly Membership[];
};

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (email === undefined || email === null) {
    return null;
  }
  const user = getUserByEmail(email);
  if (user === null) {
    return null;
  }
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    memberships: membershipsForUser(user.id),
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
  const membership = membershipForOrg(session.userId, organizationSlug);
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
  return membershipForOrg(session.userId, organizationSlug);
}

