import { styledHtmlPage } from "@/shared/ui/styled-html";


export async function GET(request: Request): Promise<Response> {
  const callbackUrl = safeCallbackUrl(new URL(request.url).searchParams.get("callbackUrl") ?? "/app");

  // Fetch CSRF token from Auth.js and forward its cookie to the client.
  // The form includes csrfToken as a hidden field so the POST handler
  // can forward both token + cookie to the Auth.js callback.
  let csrfToken = "";
  const csrfCookieHeaders: string[] = [];
  try {
    const csrfRes = await fetch(new URL("/api/auth/csrf", request.url));
    if (csrfRes.ok) {
      const data: unknown = await csrfRes.json();
      if (isRecord(data) && typeof data["csrfToken"] === "string") {
        csrfToken = data["csrfToken"];
        csrfCookieHeaders.push(...csrfRes.headers.getSetCookie());
      }
    }
  } catch {
    // CSRF fetch failed — proceed without (form post will also try)
  }

  const formPage = authForm({
    csrfToken,
    action: "/api/auth/callback/credentials",
    title: "Log in",
    submit: "Log in",
    callbackUrl,
    alternateHref: "/signup",
    alternateText: "Create an account",
  });
  const response = new Response(formPage, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  for (const cookie of csrfCookieHeaders) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const email = stringValue(form.get("email"));
  const password = stringValue(form.get("password"));
  const callbackUrl = safeCallbackUrl(stringValue(form.get("callbackUrl")) || "/app");

  // Forward credentials to Auth.js callback handler.
  // Avoid signIn() — its internal cookies().set() doesn't reliably
  // propagate to Route Handler responses across Next.js versions.
  const authUrl = new URL("/api/auth/callback/credentials", request.url);
  const body = new URLSearchParams({ email, password, callbackUrl });
  let forwardedCookie = request.headers.get("cookie") ?? "";

  const formCsrfToken = stringValue(form.get("csrfToken"));
  if (formCsrfToken !== "") {
    body.set("csrfToken", formCsrfToken);
  } else {
    // No CSRF token from form — fetch one inline (supports direct POSTs).
    try {
      const csrfRes = await fetch(new URL("/api/auth/csrf", request.url));
      if (csrfRes.ok) {
        const data: unknown = await csrfRes.json();
        const token =
          isRecord(data) && typeof data["csrfToken"] === "string"
            ? data["csrfToken"]
            : "";
        if (token !== "") {
          body.set("csrfToken", token);
          for (const c of csrfRes.headers.getSetCookie()) {
            const pair = c.split(";")[0];
            if (pair !== undefined && pair.includes("=")) {
              forwardedCookie = forwardedCookie
                ? `${forwardedCookie}; ${pair}`
                : pair;
            }
          }
        }
      }
    } catch {
      // CSRF fetch failed — attempt callback without CSRF token
    }
  }

  const authRes = await fetch(authUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: forwardedCookie,
    },
    redirect: "manual",
    body,
  });

  const responseHeaders = new Headers();
  for (const cookie of authRes.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }
  responseHeaders.set("location", callbackUrl);

  return new Response(null, { status: 303, headers: responseHeaders });
}

function authForm(input: {
  readonly csrfToken: string;
  readonly action: string;
  readonly title: string;
  readonly submit: string;
  readonly callbackUrl: string;
  readonly alternateHref: string;
  readonly alternateText: string;
}): string {
  const csrfInput =
    input.csrfToken !== ""
      ? `<input type="hidden" name="csrfToken" value="${escapeHtml(input.csrfToken)}">`
      : "";
  const content = `<h1>${escapeHtml(input.title)}</h1>
  <form method="post" action="${escapeHtml(input.action)}">
    ${csrfInput}
    <input type="hidden" name="callbackUrl" value="${escapeHtml(input.callbackUrl)}">
    <label>Email <input name="email" type="email" required></label>
    <label>Password <input name="password" type="password" required></label>
    <button type="submit">${escapeHtml(input.submit)}</button>
  </form>
  <div class="or-separator">or</div>
  <form method="post" action="/api/auth/signin/github">
    ${csrfInput}
    <input type="hidden" name="callbackUrl" value="${escapeHtml(input.callbackUrl)}">
    <button type="submit" class="github-button">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="mr-1.5 inline-block align-middle"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      Log in with GitHub
    </button>
  </form>
  <a href="${escapeHtml(input.alternateHref)}">${escapeHtml(input.alternateText)}</a>`;
  return styledHtmlPage(input.title, "ventriloc", content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
