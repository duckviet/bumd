import { Injectable } from "@nestjs/common";
import ky from "ky";
import type { TryItOutHttpClient, TryItOutResponse } from "./try-it-out-types.js";

const BlockedResponseHeaders = new Set(["set-cookie", "set-cookie2", "connection", "transfer-encoding"]);

@Injectable()
export class KyTryItOutHttpClient implements TryItOutHttpClient {
  public async send(input: {
    readonly url: URL;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly timeoutMs: number;
  }): Promise<TryItOutResponse> {
    const response = await ky(input.url, {
      method: input.method,
      headers: input.headers,
      timeout: input.timeoutMs,
      throwHttpErrors: false,
      retry: 0,
      redirect: "manual",
      ...(input.body === undefined ? {} : { body: input.body }),
    });
    return {
      status: response.status,
      headers: responseHeaders(response.headers),
      body: await response.text(),
    };
  }
}

function responseHeaders(headers: Headers): Readonly<Record<string, string>> {
  const entries = [...headers.entries()].filter(([name]) => !BlockedResponseHeaders.has(name.toLocaleLowerCase()));
  return Object.fromEntries(entries);
}
