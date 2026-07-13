import { redirect } from "next/navigation";
import { acceptDashboardInvite } from "@/shared/auth/dashboard-auth-client";
import { dashboardCredentials } from "@/shared/auth/dashboard-credentials";

type RouteContext = {
  readonly params: Promise<{
    readonly token: string;
  }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  const credentials = await dashboardCredentials();
  if (credentials === null) {
    const path = new URL(request.url).pathname;
    redirect(`/login?callbackUrl=${encodeURIComponent(path)}`);
  }
  const result = await acceptDashboardInvite(credentials.dashboardAccessCredential, token);
  if (result === null) {
    return new Response("Invite is invalid or expired.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  redirect(`/app/${result.organizationSlug}`);
}
