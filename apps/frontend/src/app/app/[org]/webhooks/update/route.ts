import { updateDashboardWebhook } from "../../../../../entities/dashboard";
import { requireDashboardManage } from "../../docs/dashboard-helpers";

type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { org } = await context.params;
  await requireDashboardManage(org);

  try {
    const body = await request.json();
    const webhookId = typeof body.webhookId === "string" ? body.webhookId : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
    const eventTypes = Array.isArray(body.eventTypes) ? body.eventTypes.map(String) : [];

    if (!webhookId || !url) {
      return Response.json({ error: "webhookId and url are required" }, { status: 400 });
    }

    const result = await updateDashboardWebhook(org, webhookId, { url, enabled, eventTypes });
    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
