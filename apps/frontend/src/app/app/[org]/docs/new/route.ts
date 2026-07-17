import { redirect } from "next/navigation";
import { createDashboardDoc } from "@/entities/dashboard";
import { requireDashboardManage } from "@/app/app/[org]/docs/dashboard-helpers";

type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

/** Create-doc UI is the dashboard modal only. GET redirects to the portals list. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { org } = await context.params;
  await requireDashboardManage(org);
  redirect(`/app/${org}/docs`);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { org } = await context.params;
  await requireDashboardManage(org);
  const form = await request.formData();
  const result = await createDashboardDoc(org, {
    name: stringValue(form.get("name")),
    slug: stringValue(form.get("slug")),
    visibility: stringValue(form.get("visibility")),
    theme: stringValue(form.get("theme")),
  });

  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");

  if (result.kind !== "created") {
    if (wantsJson) {
      return Response.json({ error: result.kind }, { status: 400 });
    }
    redirect(`/app/${org}/docs`);
  }

  const redirectUrl = `/app/${org}/docs/${result.doc.slug}`;
  if (wantsJson) {
    return Response.json({ redirectUrl });
  }
  redirect(redirectUrl);
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
