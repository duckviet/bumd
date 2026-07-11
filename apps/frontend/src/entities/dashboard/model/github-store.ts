import { getDb } from "@/shared/db";
import { randomUUID } from "node:crypto";

export type DbGithubRepository = {
  readonly id: string;
  readonly githubRepoId: string;
  readonly fullName: string;
  readonly docId: string | null;
};

export type DbGithubInstallation = {
  readonly id: string;
  readonly githubInstallationId: string;
  readonly accountName: string;
};

export type DbBranchMapping = {
  readonly id: string;
  readonly githubRepoId: string;
  readonly branchName: string;
  readonly specPath: string;
};

export async function getLinkedRepoForDoc(organizationSlug: string, docId: string): Promise<DbGithubRepository | null> {
  const db = getDb();
  const res = await db.query(
    `SELECT r.id, r."githubRepoId", r."fullName", r."docId"
     FROM "GithubRepository" r
     INNER JOIN "Organization" o ON o.id = r."organizationId"
     WHERE o.slug = $1 AND r."docId" = $2`,
    [organizationSlug, docId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    githubRepoId: row.githubRepoId,
    fullName: row.fullName,
    docId: row.docId,
  };
}

export async function listOrgInstallations(organizationSlug: string): Promise<readonly DbGithubInstallation[]> {
  const db = getDb();
  const res = await db.query(
    `SELECT i.id, i."githubInstallationId", i."accountName"
     FROM "GithubInstallation" i
     INNER JOIN "Organization" o ON o.id = i."organizationId"
     WHERE o.slug = $1`,
    [organizationSlug]
  );
  return res.rows.map((row) => ({
    id: row.id,
    githubInstallationId: row.githubInstallationId,
    accountName: row.accountName,
  }));
}

export async function listOrgRepos(organizationSlug: string): Promise<readonly DbGithubRepository[]> {
  const db = getDb();
  const res = await db.query(
    `SELECT r.id, r."githubRepoId", r."fullName", r."docId"
     FROM "GithubRepository" r
     INNER JOIN "Organization" o ON o.id = r."organizationId"
     WHERE o.slug = $1`,
    [organizationSlug]
  );
  return res.rows.map((row) => ({
    id: row.id,
    githubRepoId: row.githubRepoId,
    fullName: row.fullName,
    docId: row.docId,
  }));
}

export async function linkRepoToDoc(organizationSlug: string, docId: string, repoId: string): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) throw new Error("Organization not found");
  const orgId = orgRes.rows[0].id;

  await db.query(
    `UPDATE "GithubRepository"
     SET "docId" = $1, "updatedAt" = NOW()
     WHERE id = $2 AND "organizationId" = $3`,
    [docId, repoId, orgId]
  );
}

export async function unlinkRepoFromDoc(organizationSlug: string, repoId: string): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) throw new Error("Organization not found");
  const orgId = orgRes.rows[0].id;

  await db.query(
    `UPDATE "GithubRepository"
     SET "docId" = NULL, "updatedAt" = NOW()
     WHERE id = $1 AND "organizationId" = $2`,
    [repoId, orgId]
  );
}

export async function listDocMappings(organizationSlug: string, docId: string): Promise<readonly DbBranchMapping[]> {
  const db = getDb();
  const res = await db.query(
    `SELECT m.id, m."githubRepoId", m."branchName", m."specPath"
     FROM "GithubRepoBranchMapping" m
     INNER JOIN "Organization" o ON o.id = m."organizationId"
     WHERE o.slug = $1 AND m."docId" = $2`,
    [organizationSlug, docId]
  );
  return res.rows.map((row) => ({
    id: row.id,
    githubRepoId: row.githubRepoId,
    branchName: row.branchName,
    specPath: row.specPath,
  }));
}

export async function createDocMapping(
  organizationSlug: string,
  docId: string,
  githubRepoId: string,
  branchName: string,
  specPath: string
): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) throw new Error("Organization not found");
  const orgId = orgRes.rows[0].id;

  const id = `gmapping_${randomUUID()}`;
  await db.query(
    `INSERT INTO "GithubRepoBranchMapping" (id, "organizationId", "githubRepoId", "branchName", "specPath", "docId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [id, orgId, githubRepoId, branchName, specPath, docId]
  );
}

export async function deleteDocMapping(organizationSlug: string, mappingId: string): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) throw new Error("Organization not found");
  const orgId = orgRes.rows[0].id;

  await db.query(
    `DELETE FROM "GithubRepoBranchMapping"
     WHERE id = $1 AND "organizationId" = $2`,
    [mappingId, orgId]
  );
}
