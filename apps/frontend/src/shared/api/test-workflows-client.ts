import type {
  TestWorkflowDto,
  TestEnvironmentDto,
  TestWorkflowRunDto,
  TestWorkflowRunDetailDto,
  UpdateTestWorkflowBody,
} from "@/shared/api/test-workflow-types";
import { testWorkflowApiErrorFromResponse } from "./test-workflow-api-error";

export { TestWorkflowApiError } from "./test-workflow-api-error";

function getProxyUrl(org: string, doc: string, branch: string, subPath: string): string {
  return `/api/test-workflows/orgs/${encodeURIComponent(org)}/docs/${encodeURIComponent(doc)}/branches/${encodeURIComponent(branch)}/${subPath}`;
}

export async function listWorkflows(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly cursor?: string;
  readonly limit?: number;
}): Promise<{ items: TestWorkflowDto[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
  if (input.cursor) query.set("cursor", input.cursor);
  if (input.limit) query.set("limit", String(input.limit));
  const queryString = query.toString() ? `?${query.toString()}` : "";

  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-workflows${queryString}`));
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWorkflow(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly body: {
    readonly name: string;
    readonly slug?: string;
    readonly description?: string;
    readonly tags?: readonly string[];
    readonly priority?: TestWorkflowDto["priority"];
    readonly type?: TestWorkflowDto["type"];
    readonly definitionJson?: TestWorkflowDto["definitionJson"];
  };
}): Promise<TestWorkflowDto> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, "test-workflows"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWorkflow(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly workflowId: string;
}): Promise<TestWorkflowDto> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-workflows/${input.workflowId}`));
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateWorkflow(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly workflowId: string;
  readonly body: UpdateTestWorkflowBody;
}): Promise<TestWorkflowDto> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-workflows/${input.workflowId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  });
  if (!res.ok) throw await testWorkflowApiErrorFromResponse(res);
  return res.json();
}

export async function deleteWorkflow(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly workflowId: string;
}): Promise<void> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-workflows/${input.workflowId}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function listEnvironments(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
}): Promise<TestEnvironmentDto[]> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, "test-environments"));
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createEnvironment(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly body: {
    readonly name: string;
    readonly isDefault?: boolean;
    readonly variables?: readonly { key: string; value: string; secret?: boolean }[];
  };
}): Promise<TestEnvironmentDto> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, "test-environments"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateEnvironment(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly environmentId: string;
  readonly body: {
    readonly name?: string;
    readonly isDefault?: boolean;
    readonly variables?: readonly { key: string; value?: string; secret?: boolean; remove?: boolean }[];
  };
}): Promise<TestEnvironmentDto> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-environments/${input.environmentId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteEnvironment(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly environmentId: string;
}): Promise<void> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-environments/${input.environmentId}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function createRun(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly workflowId: string;
  readonly body: {
    readonly environmentId?: string;
  };
}): Promise<{ runId: string; status: "queued" }> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-workflows/${input.workflowId}/runs`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRun(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly workflowId: string;
  readonly runId: string;
}): Promise<TestWorkflowRunDetailDto> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-workflows/${input.workflowId}/runs/${input.runId}`));
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listRuns(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly workflowId: string;
  readonly cursor?: string;
  readonly limit?: number;
}): Promise<{ items: TestWorkflowRunDto[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
  if (input.cursor) query.set("cursor", input.cursor);
  if (input.limit) query.set("limit", String(input.limit));
  const queryString = query.toString() ? `?${query.toString()}` : "";

  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-workflows/${input.workflowId}/runs${queryString}`));
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cancelRun(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly workflowId: string;
  readonly runId: string;
}): Promise<{ runId: string; status: "canceled" }> {
  const res = await fetch(getProxyUrl(input.orgSlug, input.docSlug, input.branchSlug, `test-workflows/${input.workflowId}/runs/${input.runId}/cancel`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
