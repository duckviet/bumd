import { createDashboardApiToken } from "../../../../../entities/dashboard";
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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = typeof body.role === "string" ? body.role : "member";
    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : ["docs:read"];

    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const result = await createDashboardApiToken(org, name, role, scopes);
    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
