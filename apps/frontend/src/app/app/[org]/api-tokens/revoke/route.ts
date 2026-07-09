import { revokeDashboardApiToken } from "../../../../../entities/dashboard/api-tokens-store";
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
    const tokenId = typeof body.tokenId === "string" ? body.tokenId : "";

    if (!tokenId) {
      return Response.json({ error: "Token ID is required" }, { status: 400 });
    }

    await revokeDashboardApiToken(org, tokenId);
    return Response.json({ status: "revoked" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
