import type { ApiTokenRecord, CreateApiTokenInput, IssuedApiToken } from "./auth-types.js";

export const API_TOKEN_STORE = Symbol("API_TOKEN_STORE");

export type ApiTokenStore = {
  readonly createApiToken: (input: CreateApiTokenInput) => Promise<IssuedApiToken>;
  readonly findTokenByPrefix: (tokenPrefix: string) => Promise<ApiTokenRecord | null>;
  readonly markTokenLastUsed: (tokenId: string) => Promise<void>;
};
