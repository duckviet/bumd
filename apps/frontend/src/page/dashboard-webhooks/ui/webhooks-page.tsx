import { listDashboardWebhooks } from "@/entities/dashboard";
import { canManage, requireDashboardRead } from "@/shared/auth/dashboard-access";
import { dashboardShell } from "@/widgets/dashboard-shell";
import { WebhooksClient } from "./webhooks-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export async function WebhooksPage({ params }: PageProps): Promise<React.ReactElement> {
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
