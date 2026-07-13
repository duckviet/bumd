import { Injectable } from "@nestjs/common";
import ky, { TimeoutError } from "ky";
import type { TryItOutHttpClient, TryItOutResponse } from "./try-it-out-types.js";
import { TryItOutError, TryItOutErrorCode } from "./try-it-out-errors.js";

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
    try {
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
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new TryItOutError(TryItOutErrorCode.Timeout, "Upstream request timed out.", 504);
      }
      throw new TryItOutError(TryItOutErrorCode.RequestFailed, "Upstream request failed.", 502);
    }
  }
}

function responseHeaders(headers: Headers): Readonly<Record<string, string>> {
  const entries = [...headers.entries()].filter(([name]) => !BlockedResponseHeaders.has(name.toLocaleLowerCase()));
  return Object.fromEntries(entries);
}
