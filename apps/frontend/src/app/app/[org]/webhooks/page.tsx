import { listDashboardWebhooks } from "@/entities/dashboard";
import { canManage, dashboardShell, requireDashboardRead } from "@/app/app/[org]/docs/dashboard-helpers";
import { WebhooksClient } from "@/app/app/[org]/webhooks/webhooks-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export default async function WebhooksPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const webhooks = await listDashboardWebhooks(org);
  const mayManage = canManage(membership.role);

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    tab: "webhooks",
    children: (
      <WebhooksClient
        org={org}
        webhooks={webhooks}
        mayManage={mayManage}
      />
    ),
  });
}
