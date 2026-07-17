import { z } from "zod";
import { dashboardCredentials } from "@/shared/auth/dashboard-credentials";
import { backendBaseUrl } from "@/shared/config/env";

const installationSchema = z.object({ id: z.string(), githubInstallationId: z.string(), accountName: z.string() });
const repositorySchema = z.object({ id: z.string(), githubInstallationId: z.string(), githubRepoId: z.string(), fullName: z.string(), docId: z.string().nullable() });
const mappingSchema = z.object({ id: z.string(), githubRepoId: z.string(), branchName: z.string(), specPath: z.string(), docId: z.string() });
export type GithubInstallationDto = z.infer<typeof installationSchema>;
export type GithubRepositoryDto = z.infer<typeof repositorySchema>;
export type GithubMappingDto = z.infer<typeof mappingSchema>;

export async function githubInstallations(orgSlug: string): Promise<readonly GithubInstallationDto[]> {
  return (await request(orgSlug, "/installations", { method: "GET" }, z.object({ installations: z.array(installationSchema) }))).installations;
}
export async function githubRepositories(orgSlug: string): Promise<readonly GithubRepositoryDto[]> {
  return (await request(orgSlug, "/repositories", { method: "GET" }, z.object({ repositories: z.array(repositorySchema) }))).repositories;
}
export async function githubCreateRepository(orgSlug: string, input: { readonly githubInstallationId: string; readonly githubRepoId: string; readonly fullName: string }): Promise<GithubRepositoryDto> {
  return request(orgSlug, "/repositories", json("POST", input), repositorySchema);
}
export async function githubAssignRepository(orgSlug: string, repoId: string, docId: string | null): Promise<void> {
  await requestEmpty(orgSlug, `/repositories/${segment(repoId)}`, json("PATCH", { docId }));
}
export async function githubMappings(orgSlug: string, docId: string): Promise<readonly GithubMappingDto[]> {
  return (await request(orgSlug, `/docs/${segment(docId)}/mappings`, { method: "GET" }, z.object({ mappings: z.array(mappingSchema) }))).mappings;
}
export async function githubCreateMapping(orgSlug: string, githubRepoId: string, input: { readonly docId: string; readonly branchName: string; readonly specPath: string }): Promise<GithubMappingDto> {
  return request(orgSlug, `/repositories/${segment(githubRepoId)}/mappings`, json("POST", input), mappingSchema);
}
export async function githubDeleteMapping(orgSlug: string, mappingId: string): Promise<void> {
  await requestEmpty(orgSlug, `/mappings/${segment(mappingId)}`, { method: "DELETE" });
}
export async function githubUpsertInstallation(orgSlug: string, githubInstallationId: string, accountName: string): Promise<void> {
  await request(orgSlug, "/installations", json("POST", { githubInstallationId, accountName }), installationSchema);
}
export async function githubSimulatePush(orgSlug: string, mappingId: string): Promise<void> {
  await request(orgSlug, "/simulations/push", json("POST", { mappingId }), z.object({ accepted: z.literal(true) }));
}

async function request<T>(orgSlug: string, path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const response = await authenticated(orgSlug, path, init);
  if (!response.ok) throw new DashboardGithubError(response.status);
  return schema.parse(await response.json());
}
async function requestEmpty(orgSlug: string, path: string, init: RequestInit): Promise<void> {
  const response = await authenticated(orgSlug, path, init);
  if (!response.ok) throw new DashboardGithubError(response.status);
}
async function authenticated(orgSlug: string, path: string, init: RequestInit): Promise<Response> {
  const credentials = await dashboardCredentials();
  if (credentials === null) throw new DashboardGithubError(401);
  const headers = new Headers(init.headers); headers.set("authorization", `Bearer ${credentials.dashboardAccessCredential}`);
  return fetch(new URL(`/v1/dashboard/orgs/${segment(orgSlug)}/github${path}`, backendBaseUrl()), { ...init, headers, cache: "no-store" });
}
function json(method: "POST" | "PATCH", body: unknown): RequestInit { return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }; }
function segment(value: string): string { return encodeURIComponent(value); }
export class DashboardGithubError extends Error { public constructor(public readonly statusCode: number) { super(`Dashboard GitHub request failed with HTTP ${statusCode}`); } }
