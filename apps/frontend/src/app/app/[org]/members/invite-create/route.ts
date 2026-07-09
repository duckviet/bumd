import { createDashboardInvite } from "../../../../../entities/dashboard/members-invites-store";
import { requireDashboardManage } from "../../docs/dashboard-helpers";

type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { org } = await context.params;
  const { session } = await requireDashboardManage(org);

  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : null;
    const role = typeof body.role === "string" ? body.role : "member";

    const result = await createDashboardInvite(org, session.email, email, role);
    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
