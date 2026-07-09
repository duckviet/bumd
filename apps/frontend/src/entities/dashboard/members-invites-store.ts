import { getDb } from "../../shared/db";
import { randomBytes, randomUUID, createHash } from "node:crypto";

export type DashboardMember = {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly createdAt: string;
};

export type DashboardInvite = {
  readonly id: string;
  readonly email: string | null;
  readonly role: string;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
};

export async function listDashboardMembers(organizationSlug: string): Promise<readonly DashboardMember[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT m.id, m."userId", u.email, u.name, m.role::text AS role, m."createdAt"
     FROM "Membership" m
     INNER JOIN "Organization" o ON o.id = m."organizationId"
     INNER JOIN "User" u ON u.id = m."userId"
     WHERE o.slug = $1
     ORDER BY u.email ASC`,
    [organizationSlug]
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: (row.createdAt as Date).toISOString(),
  }));
}

export async function listDashboardInvites(organizationSlug: string): Promise<readonly DashboardInvite[]> {
  const db = getDb();
  const result = await db.query(
    `SELECT i.id, i.email, i.role::text AS role, i."expiresAt", i."acceptedAt", i."revokedAt", i."createdAt"
     FROM "Invite" i
     INNER JOIN "Organization" o ON o.id = i."organizationId"
     WHERE o.slug = $1
     ORDER BY i."createdAt" DESC`,
    [organizationSlug]
  );
  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: (row.expiresAt as Date).toISOString(),
    acceptedAt: row.acceptedAt ? (row.acceptedAt as Date).toISOString() : null,
    revokedAt: row.revokedAt ? (row.revokedAt as Date).toISOString() : null,
    createdAt: (row.createdAt as Date).toISOString(),
  }));
}

export async function updateDashboardMemberRole(
  organizationSlug: string,
  membershipId: string,
  role: string
): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  await db.query(
    `UPDATE "Membership"
     SET role = $1::"MembershipRole", "updatedAt" = NOW()
     WHERE id = $2 AND "organizationId" = $3`,
    [role, membershipId, orgId]
  );
}

export async function deleteDashboardMember(organizationSlug: string, membershipId: string): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  await db.query(
    `DELETE FROM "Membership"
     WHERE id = $1 AND "organizationId" = $2`,
    [membershipId, orgId]
  );
}

export async function createDashboardInvite(
  organizationSlug: string,
  createdByEmail: string,
  email: string | null,
  role: string
): Promise<{ readonly id: string; readonly token: string; readonly invite: DashboardInvite }> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  const token = `bumd_inv_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = `inv_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.query(
    `INSERT INTO "Invite" (id, "tokenHash", "organizationId", email, role, "expiresAt", "createdBy", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::"MembershipRole", $6, $7, NOW(), NOW())`,
    [id, tokenHash, orgId, email || null, role, expiresAt, createdByEmail]
  );

  const invite: DashboardInvite = {
    id,
    email: email || null,
    role,
    expiresAt: expiresAt.toISOString(),
    acceptedAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  };

  return { id, token, invite };
}

export async function revokeDashboardInvite(organizationSlug: string, inviteId: string): Promise<void> {
  const db = getDb();
  const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [organizationSlug]);
  if (orgRes.rows.length === 0) {
    throw new Error("Organization not found");
  }
  const orgId = orgRes.rows[0]["id"] as string;

  await db.query(
    `UPDATE "Invite"
     SET "revokedAt" = NOW(), "updatedAt" = NOW()
     WHERE id = $1 AND "organizationId" = $2`,
    [inviteId, orgId]
  );
}
