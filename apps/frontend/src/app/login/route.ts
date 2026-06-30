import { styledHtmlPage } from "../../shared/ui/styled-html";


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
  const content = `<h1>${escapeHtml(input.title)}</h1><form method="post" action="${escapeHtml(input.action)}">${csrfInput}<input type="hidden" name="callbackUrl" value="${escapeHtml(input.callbackUrl)}"><label>Email <input name="email" type="email" required></label><label>Password <input name="password" type="password" required></label><button type="submit">${escapeHtml(input.submit)}</button></form><a href="${escapeHtml(input.alternateHref)}">${escapeHtml(input.alternateText)}</a>`;
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
