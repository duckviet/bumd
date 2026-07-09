import { HttpException } from "@nestjs/common";
import { requestId } from "../versions/deploy-errors.js";

export class TestWorkflowError extends Error {
  public constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TestWorkflowError";
  }
}

export function testWorkflowHttpException(error: TestWorkflowError): HttpException {
  return new HttpException(
    {
      error: {
        code: error.code,
        message: error.message,
        requestId: requestId(),
        ...error.extra,
      },
    },
    error.statusCode,
  );
}
