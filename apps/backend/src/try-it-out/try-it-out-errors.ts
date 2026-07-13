export const TryItOutErrorCode = {
  VersionNotFound: "try_it_out_version_not_found",
  InvalidRequest: "invalid_try_it_out_request",
  TargetForbidden: "try_it_out_target_forbidden",
  Timeout: "try_it_out_timeout",
  RequestFailed: "try_it_out_request_failed",
} as const;

export type TryItOutErrorCode = (typeof TryItOutErrorCode)[keyof typeof TryItOutErrorCode];

export class TryItOutError extends Error {
  public constructor(
    public readonly code: TryItOutErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "TryItOutError";
  }
}
