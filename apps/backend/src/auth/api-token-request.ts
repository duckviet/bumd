import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { ApiTokenAuthContext } from "./auth-types.js";

export type ApiTokenRequest = {
  readonly headers: {
    readonly authorization?: string;
  };
  apiTokenAuth?: ApiTokenAuthContext;
};

export const AuthenticatedApiToken = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<ApiTokenRequest>();
  return request.apiTokenAuth ?? null;
});
