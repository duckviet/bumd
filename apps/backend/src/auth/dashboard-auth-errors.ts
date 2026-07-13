import { HttpException } from "@nestjs/common";
import { requestId } from "../versions/deploy-errors.js";

export type DashboardAuthErrorCode = "unauthorized" | "validation_failed" | "duplicate_resource" | "invalid_invite" | "not_found";

export function dashboardAuthHttpException(input: {
  readonly code: DashboardAuthErrorCode;
  readonly message: string;
  readonly statusCode: 400 | 401 | 404 | 409;
}): HttpException {
  return new HttpException(
    {
      error: {
        code: input.code,
        message: input.message,
        requestId: requestId(),
        details: {},
      },
    },
    input.statusCode,
  );
}
