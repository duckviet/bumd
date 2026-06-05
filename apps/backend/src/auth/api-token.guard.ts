import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { API_TOKEN_STORE, type ApiTokenStore } from "./auth-ports.js";
import { ApiTokenCrypto } from "./api-token-crypto.js";
import type { ApiTokenRequest } from "./api-token-request.js";
import { authHttpException } from "./auth-errors.js";

@Injectable()
export class ApiTokenGuard implements CanActivate {
  public constructor(
    @Inject(API_TOKEN_STORE) private readonly store: ApiTokenStore,
    private readonly crypto: ApiTokenCrypto,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiTokenRequest>();
    const plaintext = extractToken(request.headers.authorization);
    if (plaintext === null) {
      throw authHttpException({ code: "unauthorized", message: "Missing or invalid API token", statusCode: 401 });
    }
    const prefix = this.crypto.prefix(plaintext);
    const record = await this.store.findTokenByPrefix(prefix);
    if (record === null || record.revokedAt !== null || isExpired(record.expiresAt)) {
      throw authHttpException({ code: "unauthorized", message: "Missing or invalid API token", statusCode: 401 });
    }
    const verified = await this.crypto.verify(record.tokenHash, plaintext);
    if (!verified) {
      throw authHttpException({ code: "unauthorized", message: "Missing or invalid API token", statusCode: 401 });
    }
    const auth = {
      tokenId: record.id,
      organizationId: record.organizationId,
      role: record.role,
      scopes: record.scopes,
    };
    request.apiTokenAuth = auth;
    void this.store.markTokenLastUsed(record.id).catch((error: unknown) => {
      void error;
    });
    return true;
  }
}

function extractToken(authorization: string | undefined): string | null {
  const [scheme, token, extra] = authorization?.split(" ") ?? [];
  if (!isApiTokenScheme(scheme) || token === undefined || token.trim() === "" || extra !== undefined) {
    return null;
  }
  return token;
}

function isApiTokenScheme(value: string | undefined): boolean {
  return value === "Bearer" || value === "Token";
}

function isExpired(expiresAt: string | null): boolean {
  return expiresAt !== null && Date.parse(expiresAt) <= Date.now();
}
