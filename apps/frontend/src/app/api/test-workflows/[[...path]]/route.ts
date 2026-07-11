import { type NextRequest } from "next/server";
import { getMembershipForOrg } from "@/shared/auth/session";
import { backendBaseUrl } from "@/shared/config/env";

type RouteContext = {
  readonly params: Promise<{
    readonly path?: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

async function handleProxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const url = new URL(request.url);
  const params = await context.params;
  const pathParts = params.path ?? [];
  const path = "/" + pathParts.join("/");

  // path looks like: /orgs/:org/docs/:doc/branches/:branch/test-workflows...
  const parts = path.split("/");
  // parts[0] is "", parts[1] is "orgs", parts[2] is the organization slug
  const orgSlug = parts[2];

  if (parts[1] !== "orgs" || !orgSlug) {
    return new Response("Invalid request path in test-workflows proxy", { status: 400 });
  }

  // Get user membership and enforce RBAC
  const membership = await getMembershipForOrg(orgSlug);
  if (membership === null) {
    return new Response("Unauthorized", { status: 401 });
  }

  const role = membership.role;
  const isWrite = request.method !== "GET" && request.method !== "HEAD";

  if (isWrite) {
    const isEnvPath = path.includes("/test-environments");
    if (isEnvPath) {
      if (role !== "owner" && role !== "admin") {
        return new Response("Forbidden: Requires admin or owner role", { status: 403 });
      }
    } else {
      if (role !== "owner" && role !== "admin" && role !== "member") {
        return new Response("Forbidden: Requires member, admin, or owner role", { status: 403 });
      }
    }
  }

  // Authenticate to backend using admin token to issue a scoped API token
  const adminToken = process.env["BUMD_ADMIN_SESSION_TOKEN"];
  if (!adminToken || adminToken.trim() === "") {
    if (process.env["NODE_ENV"] === "production") {
      return new Response("BUMD_ADMIN_SESSION_TOKEN environment variable is not configured", { status: 500 });
    }
  }
  const finalAdminToken = adminToken || "test_admin_session_not_secret";

  const tokenRes = await fetch(`${backendBaseUrl()}/v1/orgs/${orgSlug}/api-tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${finalAdminToken}`,
    },
    body: JSON.stringify({
      name: `web-session-${Date.now()}`,
      role: "owner",
      scopes: ["docs:deploy", "docs:read", "docs:test"],
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return new Response(`Failed to authenticate with backend: ${errText}`, { status: 500 });
  }

  const tokenData = await tokenRes.json();
  const apiToken = tokenData.token;

  // Forward the request to backend
  const backendUrl = `${backendBaseUrl()}/v1${path}${url.search}`;
  const requestHeaders = new Headers();
  requestHeaders.set("Authorization", `Bearer ${apiToken}`);
  requestHeaders.set("Content-Type", "application/json");

  const init: RequestInit = {
    method: request.method,
    headers: requestHeaders,
  };

  if (isWrite) {
    init.body = await request.text();
  }

  try {
    const backendRes = await fetch(backendUrl, init);
    const resBody = await backendRes.text();
    return new Response(resBody, {
      status: backendRes.status,
      headers: {
        "Content-Type": backendRes.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (err) {
    return new Response(`Proxy request failed: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
}
