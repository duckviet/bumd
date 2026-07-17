import { TryItOutError, TryItOutErrorCode } from "../../try-it-out/try-it-out-errors.js";
import { TestWorkflowError } from "../test-workflow-errors.js";
import { TestWorkflowErrorCode } from "../test-workflow-types.js";

export type ClassifiedWorkflowError = {
  readonly code: string;
  readonly message: string;
};

export function classifyWorkflowStepError(error: unknown): ClassifiedWorkflowError {
  if (error instanceof TestWorkflowError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof TryItOutError) {
    return {
      code: requestErrorCode(error.code),
      message: error.message,
    };
  }
  return {
    code: TestWorkflowErrorCode.RequestFailed,
    message: error instanceof Error ? error.message : "Unknown request error",
  };
}

export function classifyWorkflowRunError(error: unknown): ClassifiedWorkflowError {
  if (error instanceof TestWorkflowError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: TestWorkflowErrorCode.InternalError,
    message: error instanceof Error ? error.message : "Unknown workflow error",
  };
}

function requestErrorCode(code: TryItOutErrorCode): TestWorkflowErrorCode {
  switch (code) {
    case TryItOutErrorCode.TargetForbidden:
      return TestWorkflowErrorCode.RequestBlocked;
    case TryItOutErrorCode.Timeout:
      return TestWorkflowErrorCode.RequestTimeout;
    case TryItOutErrorCode.VersionNotFound:
    case TryItOutErrorCode.InvalidRequest:
    case TryItOutErrorCode.RequestFailed:
      return TestWorkflowErrorCode.RequestFailed;
  }
}
