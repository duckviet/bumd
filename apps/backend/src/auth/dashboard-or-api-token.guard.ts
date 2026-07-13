import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ApiTokenGuard } from "./api-token.guard.js";
import type { ApiTokenRequest } from "./api-token-request.js";
import { ApiTokenScope } from "./auth-types.js";
import { DashboardAuthService } from "./dashboard-auth.service.js";

type ScopedRequest = ApiTokenRequest & { readonly params?: { readonly orgSlug?: string } };

@Injectable()
export class DashboardOrApiTokenGuard implements CanActivate {
  public constructor(private readonly apiTokens: ApiTokenGuard, private readonly dashboard: DashboardAuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await this.apiTokens.canActivate(context);
    } catch (apiError) {
      const request = context.switchToHttp().getRequest<ScopedRequest>();
      const credential = bearer(request.headers.authorization);
      const principal = credential === null ? null : await this.dashboard.principal(credential);
      const orgSlug = request.params?.orgSlug;
      if (principal === null || orgSlug === undefined) throw apiError;
      const membership = await this.dashboard.membership(principal, orgSlug);
      if (membership === null) throw apiError;
      request.apiTokenAuth = { tokenId: principal.userId, organizationId: orgSlug, role: membership.role, scopes: [ApiTokenScope.DocsDeploy, ApiTokenScope.DocsRead, ApiTokenScope.DocsTest] };
      return true;
    }
  }
}

function bearer(value: string | undefined): string | null {
  const [scheme, token, extra] = value?.split(" ") ?? [];
  return scheme === "Bearer" && token !== undefined && token !== "" && extra === undefined ? token : null;
}
