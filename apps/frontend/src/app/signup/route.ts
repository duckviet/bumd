import { redirect } from "next/navigation";
import { registerUser } from "@/shared/auth/auth-store";
import { styledHtmlPage } from "@/shared/ui/styled-html";

export async function GET(request: Request): Promise<Response> {
  let csrfToken = "";
  const csrfCookieHeaders: string[] = [];
  try {
    const csrfRes = await fetch(new URL("/api/auth/csrf", request.url));
    if (csrfRes.ok) {
      const data: unknown = await csrfRes.json();
      if (typeof data === "object" && data !== null && !Array.isArray(data) && typeof (data as any)["csrfToken"] === "string") {
        csrfToken = (data as any)["csrfToken"];
        csrfCookieHeaders.push(...csrfRes.headers.getSetCookie());
      }
    }
  } catch {
    // CSRF fetch failed
  }

  const csrfInput = csrfToken !== ""
    ? `<input type="hidden" name="csrfToken" value="${csrfToken.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}">`
    : "";

  const content = `<h1>Sign up</h1>
  <form method="post" action="/signup">
    <label>Name <input name="name" required></label>
    <label>Email <input name="email" type="email" required></label>
    <label>Password <input name="password" type="password" required></label>
    <button type="submit">Create account</button>
  </form>
  <div class="or-separator">or</div>
  <form method="post" action="/api/auth/signin/github">
    ${csrfInput}
    <input type="hidden" name="callbackUrl" value="/app">
    <button type="submit" class="github-button">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="mr-1.5 inline-block align-middle"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      Sign up with GitHub
    </button>
  </form>
  <a href="/login">Log in</a>`;

  const response = new Response(
    styledHtmlPage("Sign up", "ventriloc", content),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

  for (const cookie of csrfCookieHeaders) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  await registerUser({
    email: stringValue(form.get("email")),
    password: stringValue(form.get("password")),
    name: stringValue(form.get("name")),
  });
  redirect("/login?created=1");
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
