declare global {
  type EndpointHandler<Params = Record<string, unknown>, Context = Record<string, unknown>, Result = Record<string, unknown>> = (
    params: Params,
    context: Context,
  ) => Result | Promise<Result>;
  type OAuthConfigInternal<Profile = Record<string, unknown>> = Record<string, unknown> & {
    readonly profile?: Profile;
  };
}

declare module "@auth/core/types" {
  export interface RequestInternal {
    readonly body?: unknown;
    readonly cookies?: Record<string, string>;
    readonly headers?: Headers;
    readonly method?: string;
    readonly query?: Record<string, string>;
  }

  export interface InternalOptions<ProviderType = string> {
    readonly providerType?: ProviderType;
  }
}

export {};
