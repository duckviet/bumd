import { z } from "zod";
import { backendBaseUrl } from "@/shared/config/env";
import { dashboardCredentials } from "@/shared/auth/dashboard-credentials";

const memberSchema = z.object({
  id: z.string(), userId: z.string(), email: z.string().email(), name: z.string(), role: z.string(), createdAt: z.string(),
});
const inviteSchema = z.object({
  id: z.string(), email: z.string().nullable(), role: z.string(), expiresAt: z.string(), acceptedAt: z.string().nullable(), revokedAt: z.string().nullable(), createdAt: z.string(),
});
const webhookSchema = z.object({
  id: z.string(), url: z.string(), description: z.string().nullable(), enabled: z.boolean(), eventTypes: z.array(z.string()), createdAt: z.string(),
});
const deliverySchema = z.object({
  id: z.string(), eventId: z.string(), eventType: z.string(), status: z.string(), attemptCount: z.number(), statusCode: z.number().nullable(), success: z.boolean(), lastError: z.string().nullable(), createdAt: z.string(),
});
const versionSchema = z.object({ id: z.string(), label: z.string(), sequenceNumber: z.number(), status: z.union([z.literal("queued"), z.literal("processing"), z.literal("ready"), z.literal("failed")]), sha256: z.string(), createdAt: z.string(), readyAt: z.string().nullable() });
const docSchema = z.object({ id: z.string(), organizationSlug: z.string(), slug: z.string(), name: z.string(), visibility: z.union([z.literal("public"), z.literal("private")]), theme: z.string(), publicUrl: z.string(), versions: z.array(versionSchema), createdAt: z.string() });
const apiTokenSchema = z.object({ id: z.string(), name: z.string(), tokenPrefix: z.string(), role: z.string(), scopes: z.array(z.string()), lastUsedAt: z.string().nullable(), expiresAt: z.string().nullable(), revokedAt: z.string().nullable(), createdAt: z.string() });
const versionDetailSchema = z.object({ id: z.string(), sequenceNumber: z.number(), status: z.union([z.literal("queued"), z.literal("processing"), z.literal("ready"), z.literal("failed")]), sha256: z.string(), createdByTokenId: z.string().nullable(), createdByUserId: z.string().nullable(), createdAt: z.string(), readyAt: z.string().nullable(), branchName: z.string(), docName: z.string(), diff: z.object({ id: z.string(), classification: z.string(), hasBreaking: z.boolean() }).nullable() });
const diffDetailSchema = z.object({ versionId: z.string(), sequenceNumber: z.number(), docName: z.string(), id: z.string(), classification: z.string(), hasBreaking: z.boolean(), changes: z.unknown(), diffMarkdown: z.string().nullable() });
const testsContextSchema = z.object({
  organizationId: z.string(),
  docId: z.string(),
  branchId: z.string(),
  branchSlug: z.string(),
  workflows: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    tags: z.array(z.string()),
    priority: z.enum(["low", "medium", "high", "critical"]),
    type: z.enum(["smoke", "integration", "end_to_end", "contract"]),
    definitionJson: z.unknown(),
    revision: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
});

export type DashboardMemberDto = z.infer<typeof memberSchema>;
export type DashboardInviteDto = z.infer<typeof inviteSchema>;
export type DashboardWebhookDto = z.infer<typeof webhookSchema>;
export type DashboardWebhookDeliveryDto = z.infer<typeof deliverySchema>;
export type DashboardDocDto = z.infer<typeof docSchema>;
export type DashboardApiTokenDto = z.infer<typeof apiTokenSchema>;
export type DashboardVersionDetailDto = z.infer<typeof versionDetailSchema>;
export type DashboardDiffDetailDto = z.infer<typeof diffDetailSchema>;
export type DashboardTestsContextDto = z.infer<typeof testsContextSchema>;

export async function dashboardVersionDetail(orgSlug: string, docSlug: string, versionId: string): Promise<DashboardVersionDetailDto | null> {
  try { return await request(orgSlug, `/docs/${segment(docSlug)}/versions/${segment(versionId)}`, { method: "GET" }, versionDetailSchema); }
  catch (error) { if (error instanceof DashboardManagementError && error.statusCode === 404) return null; throw error; }
}
export async function dashboardDiffDetail(orgSlug: string, docSlug: string, versionId: string): Promise<DashboardDiffDetailDto | null> {
  try { return await request(orgSlug, `/docs/${segment(docSlug)}/versions/${segment(versionId)}/diff`, { method: "GET" }, diffDetailSchema); }
  catch (error) { if (error instanceof DashboardManagementError && error.statusCode === 404) return null; throw error; }
}
export async function dashboardTestsContext(orgSlug: string, docSlug: string): Promise<DashboardTestsContextDto | null> {
  try { return await request(orgSlug, `/docs/${segment(docSlug)}/tests-context`, { method: "GET" }, testsContextSchema); }
  catch (error) { if (error instanceof DashboardManagementError && error.statusCode === 404) return null; throw error; }
}
export async function dashboardDeploySpec(orgSlug: string, docSlug: string, branchSlug: string, body: unknown): Promise<void> {
  const credentials = await dashboardCredentials();
  if (credentials === null) throw new DashboardManagementError(401);
  const response = await fetch(new URL(`/v1/dashboard/orgs/${segment(orgSlug)}/docs/${segment(docSlug)}/branches/${segment(branchSlug)}/deploys`, backendBaseUrl()), { method: "POST", headers: { authorization: `Bearer ${credentials.dashboardAccessCredential}`, "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (!response.ok) throw new DashboardManagementError(response.status);
}

export async function dashboardApiTokens(orgSlug: string): Promise<readonly DashboardApiTokenDto[]> {
  return (await request(orgSlug, "/api-tokens", { method: "GET" }, z.object({ apiTokens: z.array(apiTokenSchema) }))).apiTokens;
}

export async function dashboardCreateApiToken(orgSlug: string, name: string, role: string, scopes: readonly string[]): Promise<{ readonly token: string; readonly apiToken: DashboardApiTokenDto }> {
  return request(orgSlug, "/api-tokens", json("POST", { name, role, scopes }), z.object({ token: z.string(), apiToken: apiTokenSchema }));
}

export async function dashboardRevokeApiToken(orgSlug: string, tokenId: string): Promise<void> {
  await requestEmpty(orgSlug, `/api-tokens/${segment(tokenId)}`, { method: "DELETE" });
}

export async function dashboardDocs(orgSlug: string): Promise<readonly DashboardDocDto[]> {
  return (await request(orgSlug, "/docs", { method: "GET" }, z.object({ docs: z.array(docSchema) }))).docs;
}

export async function dashboardDoc(orgSlug: string, docSlug: string): Promise<DashboardDocDto | null> {
  try { return await request(orgSlug, `/docs/${segment(docSlug)}`, { method: "GET" }, docSchema); }
  catch (error) { if (error instanceof DashboardManagementError && error.statusCode === 404) return null; throw error; }
}

export async function dashboardCreateDoc(orgSlug: string, body: unknown): Promise<DashboardDocDto> {
  return request(orgSlug, "/docs", json("POST", body), docSchema);
}

export async function dashboardUpdateDoc(orgSlug: string, docSlug: string, body: unknown): Promise<DashboardDocDto> {
  return request(orgSlug, `/docs/${segment(docSlug)}`, json("PATCH", body), docSchema);
}

export async function dashboardDeleteDoc(orgSlug: string, docSlug: string): Promise<void> {
  await requestEmpty(orgSlug, `/docs/${segment(docSlug)}`, { method: "DELETE" });
}

export async function dashboardMembers(orgSlug: string): Promise<readonly DashboardMemberDto[]> {
  return (await request(orgSlug, "/members", { method: "GET" }, z.object({ members: z.array(memberSchema) }))).members;
}

export async function dashboardUpdateMember(orgSlug: string, memberId: string, role: string): Promise<void> {
  await request(orgSlug, `/members/${segment(memberId)}`, json("PATCH", { role }), memberSchema);
}

export async function dashboardDeleteMember(orgSlug: string, memberId: string): Promise<void> {
  await requestEmpty(orgSlug, `/members/${segment(memberId)}`, { method: "DELETE" });
}

export async function dashboardInvites(orgSlug: string): Promise<readonly DashboardInviteDto[]> {
  return (await request(orgSlug, "/invites", { method: "GET" }, z.object({ invites: z.array(inviteSchema) }))).invites;
}

export async function dashboardCreateInvite(orgSlug: string, email: string | null, role: string): Promise<{ readonly id: string; readonly token: string; readonly invite: DashboardInviteDto }> {
  const created = await request(orgSlug, "/invites", json("POST", { email, role }), inviteSchema.extend({ token: z.string() }));
  return { id: created.id, token: created.token, invite: created };
}

export async function dashboardDeleteInvite(orgSlug: string, inviteId: string): Promise<void> {
  await requestEmpty(orgSlug, `/invites/${segment(inviteId)}`, { method: "DELETE" });
}

export async function dashboardWebhooks(orgSlug: string): Promise<readonly DashboardWebhookDto[]> {
  return (await request(orgSlug, "/webhooks", { method: "GET" }, z.object({ webhooks: z.array(webhookSchema) }))).webhooks;
}

export async function dashboardCreateWebhook(orgSlug: string, url: string, description: string | null, eventTypes: readonly string[]): Promise<{ readonly id: string; readonly secret: string; readonly webhook: DashboardWebhookDto }> {
  const created = await request(orgSlug, "/webhooks", json("POST", { url, description, eventTypes }), webhookSchema.extend({ secret: z.string() }));
  return { id: created.id, secret: created.secret, webhook: created };
}

export async function dashboardUpdateWebhook(orgSlug: string, webhookId: string, data: { readonly url: string; readonly enabled: boolean; readonly eventTypes: readonly string[] }): Promise<DashboardWebhookDto> {
  return request(orgSlug, `/webhooks/${segment(webhookId)}`, json("PATCH", data), webhookSchema);
}

export async function dashboardDeleteWebhook(orgSlug: string, webhookId: string): Promise<void> {
  await requestEmpty(orgSlug, `/webhooks/${segment(webhookId)}`, { method: "DELETE" });
}

export async function dashboardRotateWebhook(orgSlug: string, webhookId: string): Promise<{ readonly secret: string }> {
  return request(orgSlug, `/webhooks/${segment(webhookId)}/rotate-secret`, { method: "POST" }, z.object({ secret: z.string() }));
}

export async function dashboardWebhookDeliveries(orgSlug: string, webhookId: string): Promise<readonly DashboardWebhookDeliveryDto[]> {
  const result = await request(orgSlug, `/webhooks/${segment(webhookId)}/deliveries`, { method: "GET" }, z.object({ deliveries: z.array(deliverySchema) }));
  return result.deliveries;
}

async function request<T>(orgSlug: string, path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const response = await authenticatedFetch(orgSlug, path, init);
  if (!response.ok) throw new DashboardManagementError(response.status);
  return schema.parse(await response.json());
}

async function requestEmpty(orgSlug: string, path: string, init: RequestInit): Promise<void> {
  const response = await authenticatedFetch(orgSlug, path, init);
  if (!response.ok) throw new DashboardManagementError(response.status);
}

async function authenticatedFetch(orgSlug: string, path: string, init: RequestInit): Promise<Response> {
  const credentials = await dashboardCredentials();
  if (credentials === null) throw new DashboardManagementError(401);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${credentials.dashboardAccessCredential}`);
  return fetch(new URL(`/v1/dashboard/orgs/${segment(orgSlug)}${path}`, backendBaseUrl()), { ...init, headers, cache: "no-store" });
}

function json(method: "POST" | "PATCH", body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function segment(value: string): string { return encodeURIComponent(value); }

export class DashboardManagementError extends Error {
  public constructor(public readonly statusCode: number) { super(`Dashboard backend request failed with HTTP ${statusCode}`); }
}
