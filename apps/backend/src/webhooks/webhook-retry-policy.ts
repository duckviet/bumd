export const WebhookRetryDelaysMs = [0, 30_000, 300_000, 1_800_000, 7_200_000] as const;

export function nextWebhookRetryDelay(input: {
  readonly attemptNumber: number;
  readonly statusCode: number | null;
  readonly success: boolean;
}): number | null {
  if (input.success) {
    return null;
  }
  if (!isRetryable(input.statusCode)) {
    return null;
  }
  return WebhookRetryDelaysMs[input.attemptNumber] ?? null;
}

function isRetryable(statusCode: number | null): boolean {
  if (statusCode === null) {
    return true;
  }
  if (statusCode >= 500) {
    return true;
  }
  return statusCode === 408 || statusCode === 409 || statusCode === 429;
}
