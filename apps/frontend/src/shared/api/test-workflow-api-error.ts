type ApiErrorPayload = {
  readonly code: string | null;
  readonly currentRevision: number | null;
  readonly message: string | null;
};

export class TestWorkflowApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly currentRevision: number | null;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message ?? payload.code ?? `Test workflow request failed with HTTP ${status}`);
    this.name = "TestWorkflowApiError";
    this.status = status;
    this.code = payload.code;
    this.currentRevision = payload.currentRevision;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function testWorkflowApiErrorFromResponse(response: Response): Promise<TestWorkflowApiError> {
  const body: unknown = await response.json();
  const error = isRecord(body) && isRecord(body["error"]) ? body["error"] : {};
  return new TestWorkflowApiError(response.status, {
    code: typeof error["code"] === "string" ? error["code"] : null,
    currentRevision: typeof error["currentRevision"] === "number" ? error["currentRevision"] : null,
    message: typeof error["message"] === "string" ? error["message"] : null,
  });
}
