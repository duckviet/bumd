import { notFound, redirect } from "next/navigation";
import { getDashboardDoc, updateDashboardDocSettings } from "../../../../../../entities/dashboard/dashboard-store";
import { requireDashboardManage } from "../../dashboard-helpers";
import { styledHtmlPage } from "../../../../../../shared/ui/styled-html";


type RouteContext = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { org, doc: docSlug } = await context.params;
  await requireDashboardManage(org);
  const doc = await getDashboardDoc(org, docSlug);
  if (doc === null) {
    notFound();
  }
  return htmlResponse(settingsForm(org, doc.slug, doc.visibility, doc.theme, null));
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { org, doc: docSlug } = await context.params;
  await requireDashboardManage(org);
  const form = await request.formData();
  const result = await updateDashboardDocSettings(org, docSlug, {
    visibility: stringValue(form.get("visibility")),
    theme: stringValue(form.get("theme")),
  });
  if (result.kind === "missing") {
    notFound();
  }
  if (result.kind === "invalid") {
    const doc = await getDashboardDoc(org, docSlug);
    if (doc === null) {
      notFound();
    }
    return htmlResponse(settingsForm(org, doc.slug, doc.visibility, doc.theme, "invalid"), 400);
  }
  redirect(`/app/${org}/docs/${docSlug}`);
}

function settingsForm(organizationSlug: string, docSlug: string, visibility: string, theme: string, error: string | null): string {
  const content = `<h1>Settings</h1>${error === null ? "" : `<p class="error-msg">${escapeHtml(error)}</p>`}<form method="post" action="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}/settings"><label>Visibility <select name="visibility"><option value="public"${visibility === "public" ? " selected" : ""}>public</option><option value="private"${visibility === "private" ? " selected" : ""}>private</option></select></label><label>Theme <input name="theme" value="${escapeHtml(theme)}" required></label><button type="submit">Save settings</button></form><a href="/app/${escapeHtml(organizationSlug)}/docs/${escapeHtml(docSlug)}">Overview</a>`;
  return styledHtmlPage("Settings", `${organizationSlug} / ${docSlug}`, content);
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
