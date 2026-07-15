import type { TryItOutService } from "../../try-it-out/try-it-out.service.js";
import type { JsonValue, TestWorkflowNode } from "../test-workflow-types.js";
import { TestWorkflowErrorCode } from "../test-workflow-types.js";
import { evaluateAssertions } from "./test-workflow-assertions.js";
import { classifyWorkflowStepError } from "./test-workflow-error-classifier.js";
import { extractExports } from "./test-workflow-exports.js";
import { redactSensitiveHeaders, redactSecretValues, truncateBody } from "./test-workflow-redaction.js";
import {
  collectedRefsToInputs,
  interpolate,
  type CollectedRef,
  type InterpolationContext,
} from "./test-workflow-template.js";

type StepExecutionInput = {
  readonly node: TestWorkflowNode;
  readonly route: {
    readonly orgSlug: string;
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly versionId: string;
  };
  readonly context: {
    readonly vars: Record<string, unknown>;
    readonly env: Record<string, string>;
    readonly data: Readonly<Record<string, JsonValue>>;
    readonly secretKeys: ReadonlySet<string>;
    readonly secretValues: ReadonlySet<string>;
  };
  readonly tryItOut: Pick<TryItOutService, "execute">;
};

type PersistedStepResult = {
  readonly requestJson: unknown;
  readonly responseJson: unknown;
  readonly assertionsJson: unknown;
  readonly exportsJson: unknown;
  readonly inputsJson: unknown;
  readonly durationMs: number;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
};

export type StepExecutionResult =
  | (PersistedStepResult & {
      readonly kind: "succeeded";
      readonly runtimeExports: Readonly<Record<string, unknown>>;
    })
  | (PersistedStepResult & { readonly kind: "failed" });

export async function executeWorkflowStep(input: StepExecutionInput): Promise<StepExecutionResult> {
  const startedAt = Date.now();
  try {
    const interpolationContext: InterpolationContext = {
      vars: input.context.vars,
      env: input.context.env,
      data: input.context.data,
      secretKeys: input.context.secretKeys,
    };
    const refs: CollectedRef[] = [];
    const resolvedTemplate = requestTemplate(interpolate(input.node.requestTemplate, interpolationContext, refs));
    let resolvedPath = input.node.path;
    for (const [key, value] of Object.entries(resolvedTemplate.pathParams ?? {})) {
      resolvedPath = resolvedPath.replace(`{${key}}`, String(value));
    }

    const requestSnapshot = redactSecretValues({
      method: input.node.method,
      serverUrl: resolvedTemplate.serverUrl ?? "",
      path: resolvedPath,
      query: resolvedTemplate.query ?? {},
      headers: redactSensitiveHeaders(stringRecord(resolvedTemplate.headers ?? {})),
      body: truncateBody(resolvedTemplate.body),
    }, input.context.secretValues);

    const response = await input.tryItOut.execute({
      orgSlug: input.route.orgSlug,
      docSlug: input.route.docSlug,
      branchSlug: input.route.branchSlug,
      versionId: input.route.versionId,
      body: {
        serverUrl: resolvedTemplate.serverUrl ?? "",
        method: input.node.method.toUpperCase(),
        path: resolvedPath,
        query: stringRecord(resolvedTemplate.query ?? {}),
        headers: stringRecord(resolvedTemplate.headers ?? {}),
        body: resolvedTemplate.body,
      },
    });
    const durationMs = Date.now() - startedAt;
    const resolvedResponse = {
      status: response.status,
      headers: { ...response.headers },
      body: parseResponseBody(response.body),
      durationMs,
    };
    const assertions = evaluateAssertions(input.node.assertions, resolvedResponse);
    const failedAssertion = assertions.find((assertion) => !assertion.passed);
    const runtimeExports = extractExports(input.node.exports, resolvedResponse);
    const persisted = {
      requestJson: requestSnapshot,
      responseJson: {
        status: resolvedResponse.status,
        headers: redactSecretValues(
          redactSensitiveHeaders(stringRecord(resolvedResponse.headers)),
          input.context.secretValues,
        ),
        body: truncateBody(redactSecretValues(resolvedResponse.body, input.context.secretValues)),
      },
      assertionsJson: redactSecretValues(assertions, input.context.secretValues),
      exportsJson: redactSecretValues(runtimeExports, input.context.secretValues),
      inputsJson: redactSecretValues(
        collectedRefsToInputs(refs, input.context.env),
        input.context.secretValues,
      ),
      durationMs,
    };
    if (failedAssertion !== undefined) {
      return {
        kind: "failed",
        ...persisted,
        errorCode: TestWorkflowErrorCode.AssertionFailed,
        errorMessage: `Assertion "${failedAssertion.id}" failed`,
      };
    }
    return {
      kind: "succeeded",
      ...persisted,
      runtimeExports,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    const classified = classifyWorkflowStepError(error);
    const redactedMessage = redactSecretValues(classified.message, input.context.secretValues);
    return {
      kind: "failed",
      requestJson: null,
      responseJson: null,
      assertionsJson: null,
      exportsJson: null,
      inputsJson: null,
      durationMs: Date.now() - startedAt,
      errorCode: classified.code,
      errorMessage: typeof redactedMessage === "string" ? redactedMessage : "Request failed",
    };
  }
}

function requestTemplate(value: unknown): {
  readonly serverUrl?: string;
  readonly pathParams?: Readonly<Record<string, unknown>>;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function stringRecord(values: Readonly<Record<string, unknown>>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));
}

function parseResponseBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) return body;
    throw error;
  }
}
