import { redirect } from "next/navigation";
import { acceptInvite } from "../../../shared/auth/auth-store";
import { getCurrentSession } from "../../../shared/auth/session";

type RouteContext = {
  readonly params: Promise<{
    readonly token: string;
  }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  const session = await getCurrentSession();
  if (session === null) {
    const path = new URL(request.url).pathname;
    redirect(`/login?callbackUrl=${encodeURIComponent(path)}`);
  }
  const result = await acceptInvite(token, session.userId);
  if (result.kind === "invalid") {
    return new Response("Invite is invalid or expired.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  redirect(`/app/${result.organizationSlug}`);
}
