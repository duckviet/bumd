import { deleteDashboardWebhook } from "@/entities/dashboard";
import { requireDashboardManage } from "@/shared/auth/dashboard-access";

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

    if (!webhookId) {
      return Response.json({ error: "webhookId is required" }, { status: 400 });
    }

    await deleteDashboardWebhook(org, webhookId);
    return Response.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
