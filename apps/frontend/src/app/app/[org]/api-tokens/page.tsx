import { listDashboardApiTokens } from "../../../../entities/dashboard/api-tokens-store";
import { canManage, dashboardShell, requireDashboardRead } from "../docs/dashboard-helpers";
import { ApiTokensClient } from "./api-tokens-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export default async function ApiTokensPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const tokens = await listDashboardApiTokens(org);
  const mayManage = canManage(membership.role);

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    tab: "api-tokens",
    children: <ApiTokensClient org={org} tokens={tokens} mayManage={mayManage} />,
  });
}
