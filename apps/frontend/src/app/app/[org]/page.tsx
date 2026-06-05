import { MembershipRole } from "../../../shared/auth/auth-store";
import { requireOrgRole } from "../../../shared/auth/session";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export default async function OrganizationDashboardPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireOrgRole(org, [
    MembershipRole.Owner,
    MembershipRole.Admin,
    MembershipRole.Member,
    MembershipRole.Guest,
  ]);
  return (
    <main>
      <h1>{org} dashboard</h1>
      <p>{session.email}</p>
      <p>Role: {membership.role}</p>
    </main>
  );
}

