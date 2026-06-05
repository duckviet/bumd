export type TryItOutResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

export type TryItOutHttpClient = {
  readonly send: (input: {
    readonly url: URL;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly timeoutMs: number;
  }) => Promise<TryItOutResponse>;
};

export const TRY_IT_OUT_HTTP_CLIENT = Symbol("TRY_IT_OUT_HTTP_CLIENT");

