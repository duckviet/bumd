import { redirect } from "next/navigation";
import { createDashboardDoc } from "../../../../../entities/dashboard";
import { requireDashboardManage } from "../dashboard-helpers";
import { styledHtmlPage } from "../../../../../shared/ui/styled-html";


type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { org } = await context.params;
  await requireDashboardManage(org);
  return htmlResponse(newDocForm(org, null));
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

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    if (result.kind !== "created") {
      return Response.json({ error: result.kind }, { status: 400 });
    }
    return Response.json({ redirectUrl: `/app/${org}/docs/${result.doc.slug}` });
  }

  if (result.kind !== "created") {
    return htmlResponse(newDocForm(org, result.kind), 400);
  }
  redirect(`/app/${org}/docs/${result.doc.slug}`);
}


function newDocForm(organizationSlug: string, error: string | null): string {
  const content = `<h1>New doc</h1>${error === null ? "" : `<p class="error-msg">${escapeHtml(error)}</p>`}<form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/new"><label>Name <input name="name" required></label><label>Slug <input name="slug" required></label><label>Visibility <select name="visibility"><option value="public">public</option><option value="private">private</option></select></label><label>Theme <input name="theme" value="classic" required></label><button type="submit">Create doc</button></form><a href="/app/${escapeHtml(organizationSlug)}/docs">Docs</a>`;
  return styledHtmlPage("New doc", organizationSlug, content);
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
