import { Injectable } from "@nestjs/common";
import ky, { HTTPError } from "ky";
import type { WebhookHttpClient } from "./webhook-ports.js";

@Injectable()
export class KyWebhookHttpClient implements WebhookHttpClient {
  public async post(input: {
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly rawBody: string;
  }): Promise<{ readonly statusCode: number; readonly success: boolean }> {
    const response = await ky.post(input.url, {
      body: input.rawBody,
      headers: input.headers,
      timeout: 10_000,
      retry: { limit: 0 },
      throwHttpErrors: false,
    });
    return {
      statusCode: response.status,
      success: response.ok,
    };
  }
}

export function deliveryErrorMessage(error: Error): string {
  if (error instanceof HTTPError) {
    return `http_error:${error.response.status}`;
  }
  return error.message;
}
