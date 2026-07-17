import { listDashboardApiTokens } from "@/entities/dashboard";
import { canManage, requireDashboardRead } from "@/shared/auth/dashboard-access";
import { dashboardShell } from "@/widgets/dashboard-shell";
import { ApiTokensClient } from "./api-tokens-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export async function ApiTokensPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const tokens = await listDashboardApiTokens(org);
  const mayManage = canManage(membership.role);

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    tab: "api-tokens",
    children: <ApiTokensClient org={org} tokens={tokens} mayManage={mayManage} />,
  });
}
