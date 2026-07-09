import { listDashboardMembers, listDashboardInvites } from "../../../../entities/dashboard";
import { canManage, dashboardShell, requireDashboardRead } from "../docs/dashboard-helpers";
import { MembersClient } from "./members-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export default async function MembersPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const members = await listDashboardMembers(org);
  const invites = await listDashboardInvites(org);
  const mayManage = canManage(membership.role);

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    tab: "members",
    children: (
      <MembersClient
        org={org}
        members={members}
        invites={invites}
        mayManage={mayManage}
        currentUserEmail={session.email}
      />
    ),
  });
}
