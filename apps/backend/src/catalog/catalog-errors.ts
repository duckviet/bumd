import { HttpException } from "@nestjs/common";
import { requestId } from "../versions/deploy-errors.js";

export class CatalogError extends Error {
  public constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function catalogHttpException(error: CatalogError): HttpException {
  return new HttpException(
    {
      error: {
        code: error.code,
        message: error.message,
        requestId: requestId(),
      },
    },
    error.statusCode,
  );
}
