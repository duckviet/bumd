import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { DashboardAuthService } from "./dashboard-auth.service.js";
import { dashboardAuthHttpException } from "./dashboard-auth-errors.js";
import type { DashboardSessionRequest } from "./dashboard-session-request.js";

@Injectable()
export class DashboardSessionGuard implements CanActivate {
  public constructor(private readonly dashboardAuth: DashboardAuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DashboardSessionRequest>();
    const credential = bearerCredential(request.headers.authorization);
    const principal = credential === null ? null : await this.dashboardAuth.principal(credential);
    if (principal === null) {
      throw dashboardAuthHttpException({ code: "unauthorized", message: "Missing or invalid dashboard session", statusCode: 401 });
    }
    request.dashboardPrincipal = principal;
    return true;
  }
}

function bearerCredential(authorization: string | undefined): string | null {
  const [scheme, credential, extra] = authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" || credential === undefined || credential.trim() === "" || extra !== undefined) {
    return null;
  }
  return credential;
}
