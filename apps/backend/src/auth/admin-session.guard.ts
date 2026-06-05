import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { authHttpException } from "./auth-errors.js";

@Injectable()
export class AdminSessionGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      readonly headers: {
        readonly authorization?: string;
      };
    }>();
    const token = extractBearerToken(request.headers.authorization);
    const expected = expectedAdminToken();
    if (token === null || expected === null || token !== expected) {
      throw authHttpException({ code: "unauthorized", message: "Missing or invalid session", statusCode: 401 });
    }
    return true;
  }
}

export function adminSessionCanIssueForOrg(orgSlug: string): boolean {
  const configured = process.env["BUMD_ADMIN_SESSION_ORGS"];
  if (configured === undefined || configured.trim() === "") {
    return process.env["NODE_ENV"] !== "production";
  }
  const allowed = configured.split(",").map((value) => value.trim()).filter((value) => value !== "");
  return allowed.includes("*") || allowed.includes(orgSlug);
}

function extractBearerToken(authorization: string | undefined): string | null {
  const [scheme, token, extra] = authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" || token === undefined || token.trim() === "" || extra !== undefined) {
    return null;
  }
  return token;
}

function expectedAdminToken(): string | null {
  const configured = process.env["BUMD_ADMIN_SESSION_TOKEN"];
  if (configured !== undefined && configured.trim() !== "") {
    return configured;
  }
  if (process.env["NODE_ENV"] === "production") {
    return null;
  }
  return "test_admin_session_not_secret";
}
