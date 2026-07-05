import { listDashboardWebhookDeliveries } from "../../../../../../entities/dashboard/webhooks-store";
import { requireDashboardRead } from "../../../docs/dashboard-helpers";

type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
    readonly webhookId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { org, webhookId } = await context.params;
  await requireDashboardRead(org);

  try {
    const deliveries = await listDashboardWebhookDeliveries(org, webhookId);
    return Response.json({ deliveries });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
