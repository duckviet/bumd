import type { TestWorkflowExport } from "../test-workflow-types.js";
import { TestWorkflowErrorCode } from "../test-workflow-types.js";
import { TestWorkflowError } from "../test-workflow-errors.js";
import { resolvePath } from "./test-workflow-assertions.js";

export type ResolvedResponse = {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
};

/**
 * Extracts exports from a step response.
 * Throws EXPORT_FAILED if a required path cannot be resolved.
 */
export function extractExports(
  exports: readonly TestWorkflowExport[],
  response: ResolvedResponse,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const exp of exports) {
    result[exp.name] = extractExport(exp, response);
  }
  return result;
}

function extractExport(exp: TestWorkflowExport, response: ResolvedResponse): unknown {
  switch (exp.source) {
    case "status":
      return response.status;

    case "header": {
      if (!exp.headerName) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.ExportFailed,
          500,
          `Export "${exp.name}": headerName is required for source "header"`,
        );
      }
      const normalizedName = exp.headerName.toLowerCase();
      const value = Object.entries(response.headers).find(
        ([k]) => k.toLowerCase() === normalizedName,
      )?.[1];
      if (value === undefined) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.ExportFailed,
          422,
          `Export "${exp.name}": header "${exp.headerName}" not found in response`,
        );
      }
      return value;
    }

    case "body": {
      if (!exp.path) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.ExportFailed,
          500,
          `Export "${exp.name}": path is required for source "body"`,
        );
      }
      try {
        return resolvePath(exp.path, response.body);
      } catch (err) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.ExportFailed,
          422,
          `Export "${exp.name}": ${err instanceof Error ? err.message : "path resolution failed"}`,
        );
      }
    }

    default: {
      const _exhaustive: never = exp.source;
      throw new Error(`Unknown export source: ${String(_exhaustive)}`);
    }
  }
}
