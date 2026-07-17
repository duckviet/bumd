import { updateDashboardMemberRole } from "@/entities/dashboard";
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
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const role = typeof body.role === "string" ? body.role : "";

    if (!memberId || !role) {
      return Response.json({ error: "memberId and role are required" }, { status: 400 });
    }

    await updateDashboardMemberRole(org, memberId, role);
    return Response.json({ ok: true, role });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
