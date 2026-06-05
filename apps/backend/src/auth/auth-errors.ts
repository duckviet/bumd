import { HttpException } from "@nestjs/common";
import { requestId } from "../versions/deploy-errors.js";

export function authHttpException(input: {
  readonly code: "unauthorized" | "forbidden";
  readonly message: string;
  readonly statusCode: 401 | 403;
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
