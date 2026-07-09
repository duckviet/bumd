import { createDashboardWebhook } from "../../../../../entities/dashboard";
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
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const eventTypes = Array.isArray(body.eventTypes) ? body.eventTypes.map(String) : [];

    if (!url) {
      return Response.json({ error: "Destination URL is required" }, { status: 400 });
    }

    const result = await createDashboardWebhook(org, url, description, eventTypes);
    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
