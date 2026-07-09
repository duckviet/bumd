import { z } from "zod";
import { hashPassword, verifyPassword } from "./password";
import { getDb } from "../db";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const MembershipRole = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
  Guest: "guest",
} as const;

export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

export type AuthUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
};

export type Membership = {
  readonly organizationSlug: string;
  readonly userId: string;
  readonly role: MembershipRole;
};

type Invite = {
  readonly token: string;
  readonly organizationSlug: string;
  readonly role: MembershipRole;
  readonly expiresAt: string;
  acceptedByUserId?: string;
};

const inviteSchema = z.object({
  token: z.string().min(1),
  organizationSlug: z.string().min(1),
  role: z.union([z.literal("owner"), z.literal("admin"), z.literal("member"), z.literal("guest")]),
  expiresAt: z.string().datetime(),
});

let hasSeeded = false;

async function ensureSeeded(): Promise<void> {
  const db = getDb();
  const isTest = process.env["NODE_ENV"] === "test" || process.env["BUMD_AUTH_TEST_INVITES"] !== undefined;

  if (isTest) {
    const lockPath = path.resolve(process.cwd(), ".next-test-seed-lock");
    const lockValue = `${process.ppid}_${process.env["BUMD_AUTH_TEST_INVITES"] ?? ""}`;
    let alreadySeeded = false;
    try {
      if (fs.existsSync(lockPath)) {
        const content = fs.readFileSync(lockPath, "utf8").trim();
        if (content === lockValue) {
          alreadySeeded = true;
        }
      }
    } catch {
      // Ignore lock read errors
    }

    if (alreadySeeded) {
      return;
    }

    // Perform database reset
    await db.query('DELETE FROM "ProcessingJob"');
    await db.query('DELETE FROM "WebhookDelivery"');
    await db.query('DELETE FROM "Webhook"');
    await db.query('DELETE FROM "Diff"');
    await db.query('DELETE FROM "VersionArtifact"');
    await db.query('DELETE FROM "Version"');
    await db.query('DELETE FROM "Branch"');
    await db.query('DELETE FROM "Doc"');
    await db.query('DELETE FROM "Membership"');
    await db.query('DELETE FROM "Organization"');
    await db.query('DELETE FROM "User"');
    await db.query('DELETE FROM "Invite"');

    // Re-insert initial organizations
    await db.query(`INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES
      ('org_acme', 'acme', 'Acme Corp', NOW(), NOW()),
      ('org_other', 'other', 'Other Corp', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`);

    // Re-insert initial memberships
    await db.query(`INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt") VALUES
      ('mem_1', 'org_acme', 'usr_1', 'owner', NOW(), NOW()),
      ('mem_2', 'org_acme', 'usr_2', 'member', NOW(), NOW()),
      ('mem_3', 'org_acme', 'usr_3', 'guest', NOW(), NOW()),
      ('mem_4', 'org_other', 'usr_4', 'owner', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`);

    // Re-insert initial docs
    await db.query(`INSERT INTO "Doc" (id, "organizationId", slug, name, visibility, "defaultBranchId", "themeConfig", "createdAt", "updatedAt") VALUES
      ('doc_payments', 'org_acme', 'payments', 'Payments API', 'public', NULL, '{}'::jsonb, NOW(), NOW()),
      ('doc_private', 'org_acme', 'private-doc', 'Private API', 'private', NULL, '{}'::jsonb, NOW(), NOW()),
      ('doc_empty', 'org_acme', 'empty', 'Empty API', 'public', NULL, '{}'::jsonb, NOW(), NOW()),
      ('doc_other', 'org_other', 'other-api', 'Other API', 'private', NULL, '{}'::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`);

    // Re-insert initial branches
    await db.query(`INSERT INTO "Branch" (id, "organizationId", "docId", name, slug, "createdAt", "updatedAt") VALUES
      ('br_payments_main', 'org_acme', 'doc_payments', 'main', 'main', NOW(), NOW()),
      ('br_private_main', 'org_acme', 'doc_private', 'main', 'main', NOW(), NOW()),
      ('br_empty_main', 'org_acme', 'doc_empty', 'main', 'main', NOW(), NOW()),
      ('br_other_main', 'org_other', 'doc_other', 'main', 'main', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`);

    // Update Doc default branch IDs
    await db.query(`UPDATE "Doc" SET "defaultBranchId" = 'br_payments_main' WHERE id = 'doc_payments'`);
    await db.query(`UPDATE "Doc" SET "defaultBranchId" = 'br_private_main' WHERE id = 'doc_private'`);
    await db.query(`UPDATE "Doc" SET "defaultBranchId" = 'br_empty_main' WHERE id = 'doc_empty'`);
    await db.query(`UPDATE "Doc" SET "defaultBranchId" = 'br_other_main' WHERE id = 'doc_other'`);

    // Re-insert initial versions
    await db.query(`INSERT INTO "Version" (id, "organizationId", "docId", "branchId", "sequenceNumber", sha256, "sourceFormat", "rawSpecObjectKey", status, "validationSummary", "createdAt", "readyAt") VALUES
      ('ver_payments_1', 'org_acme', 'doc_payments', 'br_payments_main', 1, 'sha256_payments_v1', 'openapi', 'raw_specs/payments_1.yaml', 'ready', '{}'::jsonb, NOW(), NOW()),
      ('ver_payments_2', 'org_acme', 'doc_payments', 'br_payments_main', 2, 'sha256_payments_v2', 'openapi', 'raw_specs/payments_2.yaml', 'ready', '{}'::jsonb, NOW() + interval '1 hour', NOW() + interval '1 hour'),
      ('ver_payments_3', 'org_acme', 'doc_payments', 'br_payments_main', 3, 'sha256_payments_v3', 'openapi', 'raw_specs/payments_3.yaml', 'processing', '{}'::jsonb, NOW() + interval '2 hours', NULL),
      ('ver_private_1', 'org_acme', 'doc_private', 'br_private_main', 1, 'sha256_private_v1', 'openapi', 'raw_specs/private_1.yaml', 'ready', '{}'::jsonb, NOW(), NOW()),
      ('ver_other_1', 'org_other', 'doc_other', 'br_other_main', 1, 'sha256_other_v1', 'openapi', 'raw_specs/other_1.yaml', 'ready', '{}'::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`);

    // Re-insert initial version artifacts
    await db.query(`INSERT INTO "VersionArtifact" (id, "organizationId", "versionId", kind, "objectKey", "contentSha256", "createdAt") VALUES
      ('art_1', 'org_acme', 'ver_payments_1', 'normalized_spec', 'normalized/payments_1.json', 'sha256_payments_v1_norm', NOW()),
      ('art_2', 'org_acme', 'ver_payments_2', 'normalized_spec', 'normalized/payments_2.json', 'sha256_payments_v2_norm', NOW() + interval '1 hour')
      ON CONFLICT (id) DO NOTHING`);

    // Re-insert initial diffs
    await db.query(`INSERT INTO "Diff" (id, "organizationId", "docId", "branchId", "baseVersionId", "headVersionId", classification, has_breaking, diff_json, diff_markdown, summary, changes, "createdAt") VALUES
      ('diff_1', 'org_acme', 'doc_payments', 'br_payments_main', 'ver_payments_1', 'ver_payments_2', 'breaking', true, '{"breaking": true}'::jsonb, '## Breaking changes\\n- Removed \`legacyPaymentId\` from the payment response.', '{}'::jsonb, '[]'::jsonb, NOW() + interval '1 hour')
      ON CONFLICT (id) DO NOTHING`);

    try {
      fs.writeFileSync(lockPath, lockValue, "utf8");
    } catch {
      // Ignore lock write errors
    }
  } else {
    if (hasSeeded) {
      return;
    }
  }

  // Seed invites
  const invitesSeed = process.env["BUMD_AUTH_TEST_INVITES"] ?? "";
  if (invitesSeed !== "") {
    for (const row of invitesSeed.split(",")) {
      const [token, organizationSlug, role, ...expiresAtParts] = row.split(":");
      const expiresAt = expiresAtParts.join(":");
      if (token === undefined || organizationSlug === undefined || role === undefined || expiresAt === "") {
        continue;
      }
      const parsed = inviteSchema.safeParse({ token, organizationSlug, role, expiresAt });
      if (parsed.success) {
        const tokenHash = hashInviteToken(parsed.data.token);
        const existing = await db.query('SELECT id FROM "Invite" WHERE "tokenHash" = $1', [tokenHash]);
        if (existing.rows.length === 0) {
          const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [parsed.data.organizationSlug]);
          if (orgRes.rows.length > 0) {
            const orgId = orgRes.rows[0].id;
            const inviteId = `inv_${randomUUID()}`;
            await db.query(
              'INSERT INTO "Invite" (id, "tokenHash", "organizationId", role, "expiresAt", "createdBy", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
              [inviteId, tokenHash, orgId, parsed.data.role, new Date(parsed.data.expiresAt), "system"]
            );
          }
        }
      }
    }
  }

  // Seed test users
  const usersSeed = process.env["BUMD_AUTH_TEST_USERS"] ?? "";
  if (usersSeed !== "") {
    let nextIdNum = 1;
    for (const row of usersSeed.split(",")) {
      const [email, password, name, ...orgPairs] = row.split(":");
      if (email === undefined || password === undefined || name === undefined || orgPairs.length === 0) {
        continue;
      }
      if (orgPairs.length % 2 !== 0) {
        orgPairs.pop();
      }
      const normEmail = email.trim().toLowerCase();
      const existingUser = await db.query('SELECT id FROM "User" WHERE email = $1', [normEmail]);
      let userId = "";
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0]["id"] as string;
      } else {
        userId = `usr_${nextIdNum}`;
        nextIdNum++;
        const pHash = await hashPassword(password);
        await db.query(
          'INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
          [userId, normEmail, name, pHash]
        );
      }

      for (let i = 0; i < orgPairs.length; i += 2) {
        const orgSlug = orgPairs[i] ?? "";
        const role = (orgPairs[i + 1] ?? "") as MembershipRole;
        const orgRes = await db.query('SELECT id FROM "Organization" WHERE slug = $1', [orgSlug]);
        if (orgRes.rows.length > 0) {
          const orgId = orgRes.rows[0]["id"] as string;
          const memExisting = await db.query('SELECT id FROM "Membership" WHERE "organizationId" = $1 AND "userId" = $2', [orgId, userId]);
          if (memExisting.rows.length === 0) {
            const memId = `mem_${userId}_${orgSlug}`;
            await db.query(
              'INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
              [memId, orgId, userId, role]
            );
          }
        }
      }
    }
  }

  hasSeeded = true;
}

export async function registerUser(input: {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}): Promise<AuthUser> {
  await ensureSeeded();
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  
  const existing = await db.query('SELECT * FROM "User" WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      id: row["id"] as string,
      email: row["email"] as string,
      name: row["name"] as string,
      passwordHash: row["passwordHash"] as string,
    };
  }

  const countRes = await db.query('SELECT count(*)::integer as count FROM "User"');
  const count = countRes.rows[0]["count"] as number;
  const nextId = `usr_custom_${count + 1}_${randomUUID().slice(0, 8)}`;
  const passwordHash = await hashPassword(input.password);
  
  await db.query(
    'INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
    [nextId, email, input.name || email, passwordHash]
  );

  const orgId = `org_personal_${nextId}`;
  const orgSlug = `personal-${nextId}`;
  await db.query(
    'INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT DO NOTHING',
    [orgId, orgSlug, "Personal"]
  );
  
  await db.query(
    'INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW()) ON CONFLICT DO NOTHING',
    [`mem_${nextId}_personal`, orgId, nextId, "owner"]
  );

  return { id: nextId, email, name: input.name || email, passwordHash };
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  await ensureSeeded();
  const db = getDb();
  const normEmail = email.trim().toLowerCase();
  const res = await db.query('SELECT * FROM "User" WHERE email = $1', [normEmail]);
  if (res.rows.length === 0) {
    return null;
  }
  const user = res.rows[0];
  const valid = await verifyPassword(password, user["passwordHash"] as string);
  if (!valid) {
    return null;
  }
  return {
    id: user["id"] as string,
    email: user["email"] as string,
    name: user["name"] as string,
    passwordHash: user["passwordHash"] as string,
  };
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  await ensureSeeded();
  const db = getDb();
  const normEmail = email.trim().toLowerCase();
  const res = await db.query('SELECT * FROM "User" WHERE email = $1', [normEmail]);
  if (res.rows.length === 0) {
    return null;
  }
  const user = res.rows[0];
  return {
    id: user["id"] as string,
    email: user["email"] as string,
    name: user["name"] as string,
    passwordHash: user["passwordHash"] as string,
  };
}

export async function membershipsForUser(userId: string): Promise<readonly Membership[]> {
  await ensureSeeded();
  const db = getDb();
  const res = await db.query(
    `SELECT m.role, m."userId", o.slug as "organizationSlug"
     FROM "Membership" m
     JOIN "Organization" o ON m."organizationId" = o.id
     WHERE m."userId" = $1`,
    [userId]
  );
  return res.rows.map((row) => ({
    organizationSlug: row["organizationSlug"] as string,
    userId: row["userId"] as string,
    role: row["role"] as MembershipRole,
  }));
}

export async function membershipForOrg(userId: string, organizationSlug: string): Promise<Membership | null> {
  await ensureSeeded();
  const db = getDb();
  const res = await db.query(
    `SELECT m.role, m."userId", o.slug as "organizationSlug"
     FROM "Membership" m
     JOIN "Organization" o ON m."organizationId" = o.id
     WHERE m."userId" = $1 AND o.slug = $2`,
    [userId, organizationSlug]
  );
  if (res.rows.length === 0) {
    return null;
  }
  const row = res.rows[0];
  return {
    organizationSlug: row["organizationSlug"] as string,
    userId: row["userId"] as string,
    role: row["role"] as MembershipRole,
  };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function acceptInvite(token: string, userId: string): Promise<{ readonly kind: "accepted"; readonly organizationSlug: string; readonly role: MembershipRole } | { readonly kind: "invalid" }> {
  await ensureSeeded();
  const db = getDb();
  const tokenHash = hashInviteToken(token);
  const res = await db.query(
    `SELECT i.*, o.slug AS "organizationSlug"
     FROM "Invite" i
     INNER JOIN "Organization" o ON o.id = i."organizationId"
     WHERE i."tokenHash" = $1`,
    [tokenHash]
  );
  if (res.rows.length === 0) {
    return { kind: "invalid" };
  }
  const invite = res.rows[0];
  const expiresAtVal = invite["expiresAt"];
  const expiresAtTime = expiresAtVal instanceof Date ? expiresAtVal.getTime() : new Date(expiresAtVal as string).getTime();

  if (invite["acceptedByUserId"] !== null || invite["revokedAt"] !== null || expiresAtTime <= Date.now()) {
    return { kind: "invalid" };
  }

  await db.query(
    'UPDATE "Invite" SET "acceptedByUserId" = $1, "acceptedAt" = NOW(), "updatedAt" = NOW() WHERE "tokenHash" = $2',
    [userId, tokenHash]
  );

  const orgId = invite["organizationId"] as string;
  const orgSlug = invite["organizationSlug"] as string;
  const memId = `mem_${userId}_${orgSlug}_${randomUUID().slice(0, 8)}`;
  await db.query(
    'INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW()) ON CONFLICT DO NOTHING',
    [memId, orgId, userId, invite["role"] as MembershipRole]
  );

  return {
    kind: "accepted",
    organizationSlug: orgSlug,
    role: invite["role"] as MembershipRole,
  };
}
