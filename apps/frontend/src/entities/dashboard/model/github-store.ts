import { githubAssignRepository, githubCreateMapping, githubCreateRepository, githubDeleteMapping, githubInstallations, githubMappings, githubRepositories, githubSimulatePush, githubUpsertInstallation, type GithubInstallationDto, type GithubMappingDto, type GithubRepositoryDto } from "@/shared/api/dashboard-github-client";

export type DbGithubRepository = GithubRepositoryDto;
export type DbGithubInstallation = GithubInstallationDto;
export type DbBranchMapping = GithubMappingDto;

export const listOrgInstallations = githubInstallations;
export const listOrgRepos = githubRepositories;
export const listDocMappings = githubMappings;
export const deleteDocMapping = githubDeleteMapping;

export async function getLinkedRepoForDoc(organizationSlug: string, docId: string): Promise<DbGithubRepository | null> {
  return (await githubRepositories(organizationSlug)).find((repo) => repo.docId === docId) ?? null;
}
export async function linkRepoToDoc(organizationSlug: string, docId: string, repoId: string): Promise<void> { await githubAssignRepository(organizationSlug, repoId, docId); }
export async function unlinkRepoFromDoc(organizationSlug: string, repoId: string): Promise<void> { await githubAssignRepository(organizationSlug, repoId, null); }
export async function createDocMapping(organizationSlug: string, docId: string, githubRepoId: string, branchName: string, specPath: string): Promise<void> {
  await githubCreateMapping(organizationSlug, githubRepoId, { docId, branchName, specPath });
}
export async function createAndLinkRepository(organizationSlug: string, docId: string, input: { readonly githubInstallationId: string; readonly githubRepoId: string; readonly fullName: string }): Promise<void> {
  const repository = await githubCreateRepository(organizationSlug, input); await githubAssignRepository(organizationSlug, repository.id, docId);
}
export const simulateGithubPush = githubSimulatePush;
export const upsertGithubInstallation = githubUpsertInstallation;
