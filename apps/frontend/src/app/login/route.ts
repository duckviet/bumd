import { redirect } from "next/navigation";
import { signIn } from "../../../auth";

export async function GET(request: Request): Promise<Response> {
  const callbackUrl = safeCallbackUrl(new URL(request.url).searchParams.get("callbackUrl") ?? "/app");
  return htmlResponse(authForm({ action: "/login", title: "Log in", submit: "Log in", callbackUrl, alternateHref: "/signup", alternateText: "Create an account" }));
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const email = stringValue(form.get("email"));
  const password = stringValue(form.get("password"));
  const callbackUrl = safeCallbackUrl(stringValue(form.get("callbackUrl")) || "/app");
  await signIn("credentials", { email, password, redirectTo: callbackUrl });
  redirect(callbackUrl);
}

function authForm(input: {
  readonly action: string;
  readonly title: string;
  readonly submit: string;
  readonly callbackUrl: string;
  readonly alternateHref: string;
  readonly alternateText: string;
}): string {
  return `<!doctype html><html><body><main><h1>${escapeHtml(input.title)}</h1><form method="post" action="${escapeHtml(input.action)}"><input type="hidden" name="callbackUrl" value="${escapeHtml(input.callbackUrl)}"><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="password"></label><button type="submit">${escapeHtml(input.submit)}</button></form><a href="${escapeHtml(input.alternateHref)}">${escapeHtml(input.alternateText)}</a></main></body></html>`;
}

function htmlResponse(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function safeCallbackUrl(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
