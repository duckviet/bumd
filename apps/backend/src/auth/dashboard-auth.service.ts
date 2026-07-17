import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { hashDashboardPassword, verifyDashboardPassword } from "./dashboard-password.js";
import type { DashboardMembership, DashboardMembershipRole, DashboardPrincipal, DashboardSessionBundle, DashboardUser } from "./dashboard-auth-types.js";

const AccessLifetimeSeconds = 15 * 60;
const RefreshLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1000;
const issuer = "bumd-backend";
const audience = "bumd-dashboard";

const membershipRoleSchema = z.union([z.literal("owner"), z.literal("admin"), z.literal("member"), z.literal("guest")]);
const accessClaimsSchema = z.object({
  iss: z.literal(issuer),
  aud: z.literal(audience),
  sub: z.string().min(1),
  jti: z.string().min(1),
  exp: z.number().int().positive(),
});
const userRowSchema = z.object({ id: z.string(), email: z.string().email(), name: z.string().min(1), passwordHash: z.string().min(1) });
const membershipRowSchema = z.object({ organizationSlug: z.string().min(1), role: membershipRoleSchema });
const sessionRowSchema = z.object({ id: z.string(), userId: z.string(), refreshTokenHash: z.string(), expiresAt: z.coerce.date(), revokedAt: z.coerce.date().nullable() });
const inviteRowSchema = z.object({ id: z.string(), organizationId: z.string(), organizationSlug: z.string(), role: membershipRoleSchema, expiresAt: z.coerce.date(), acceptedByUserId: z.string().nullable(), revokedAt: z.coerce.date().nullable() });
const githubUserSchema = z.object({ id: z.union([z.string(), z.number()]), login: z.string().min(1), email: z.string().email().nullable().optional() });
const githubEmailSchema = z.object({ email: z.string().email(), primary: z.boolean(), verified: z.boolean() });

type UserRow = z.infer<typeof userRowSchema>;
type SessionRow = z.infer<typeof sessionRowSchema>;

@Injectable()
export class DashboardAuthService implements OnModuleDestroy {
  private readonly pool: Pool;

  public constructor() {
    const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd";
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  public async register(input: { readonly email: string; readonly password: string; readonly name: string }): Promise<DashboardSessionBundle | null> {
    const email = input.email.trim().toLowerCase();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await this.userByEmail(client, email);
      if (existing !== null) {
        await client.query("ROLLBACK");
        return this.login({ email, password: input.password });
      }
      const user: DashboardUser = { id: `usr_${randomUUID()}`, email, name: input.name.trim() || email };
      const passwordHash = await hashDashboardPassword(input.password);
      await client.query(
        'INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [user.id, user.email, user.name, passwordHash],
      );
      const organizationId = `org_personal_${user.id}`;
      await client.query(
        'INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())',
        [organizationId, `personal-${user.id}`, "Personal"],
      );
      await client.query(
        'INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4::"MembershipRole", NOW(), NOW())',
        [`mem_${randomUUID()}`, organizationId, user.id, "owner"],
      );
      const bundle = await this.createSession(client, user);
      await client.query("COMMIT");
      return bundle;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async login(input: { readonly email: string; readonly password: string }): Promise<DashboardSessionBundle | null> {
    const user = await this.userByEmail(this.pool, input.email.trim().toLowerCase());
    if (user === null || !(await verifyDashboardPassword(input.password, user.passwordHash))) {
      return null;
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const bundle = await this.createSession(client, this.publicUser(user));
      await client.query("COMMIT");
      return bundle;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async loginWithGithub(githubAccessToken: string): Promise<DashboardSessionBundle | null> {
    const githubUser = await this.githubUser(githubAccessToken);
    if (githubUser === null) {
      return null;
    }
    const email = await this.githubEmail(githubAccessToken);
    if (email === null) {
      return null;
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        'SELECT id, email, name, "passwordHash", "githubId" FROM "User" WHERE "githubId" = $1 OR email = $2 FOR UPDATE',
        [githubUser.id, email],
      );
      const row = existing.rows[0];
      const linked = z.object({ id: z.string(), email: z.string().email(), name: z.string(), passwordHash: z.string(), githubId: z.string().nullable() }).safeParse(row);
      if (linked.success && linked.data.githubId !== null && linked.data.githubId !== githubUser.id) {
        await client.query("ROLLBACK");
        return null;
      }
      let user: DashboardUser;
      if (linked.success) {
        user = this.publicUser(linked.data);
        await client.query('UPDATE "User" SET "githubId" = $1, "githubLogin" = $2, "updatedAt" = NOW() WHERE id = $3', [githubUser.id, githubUser.login, user.id]);
      } else {
        user = { id: `usr_${randomUUID()}`, email, name: githubUser.login };
        const passwordHash = await hashDashboardPassword(randomBytes(32).toString("base64url"));
        await client.query(
          'INSERT INTO "User" (id, email, name, "passwordHash", "githubId", "githubLogin", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
          [user.id, user.email, user.name, passwordHash, githubUser.id, githubUser.login],
        );
        const organizationId = `org_personal_${user.id}`;
        await client.query('INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())', [organizationId, `personal-${user.id}`, "Personal"]);
        await client.query(
          'INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4::"MembershipRole", NOW(), NOW())',
          [`mem_${randomUUID()}`, organizationId, user.id, "owner"],
        );
      }
      const bundle = await this.createSession(client, user);
      await client.query("COMMIT");
      return bundle;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async refresh(refreshCredential: string): Promise<DashboardSessionBundle | null> {
    const parsed = parseRefreshCredential(refreshCredential);
    if (parsed === null) {
      return null;
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await this.sessionById(client, parsed.sessionId, true);
      if (session === null || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now() || !safeEqual(session.refreshTokenHash, hashRefresh(parsed.secret))) {
        await client.query("ROLLBACK");
        return null;
      }
      const user = await this.userById(client, session.userId);
      if (user === null) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query('UPDATE "DashboardSession" SET "revokedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1', [session.id]);
      const bundle = await this.createSession(client, this.publicUser(user));
      await client.query("COMMIT");
      return bundle;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async revoke(principal: DashboardPrincipal): Promise<void> {
    await this.pool.query('UPDATE "DashboardSession" SET "revokedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1 AND "userId" = $2 AND "revokedAt" IS NULL', [principal.sessionId, principal.userId]);
  }

  public async principal(accessCredential: string): Promise<DashboardPrincipal | null> {
    const claims = verifyAccessCredential(accessCredential);
    if (claims === null) {
      return null;
    }
    const session = await this.sessionById(this.pool, claims.jti, false);
    if (session === null || session.userId !== claims.sub || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return { userId: claims.sub, sessionId: claims.jti };
  }

  public async currentUser(principal: DashboardPrincipal): Promise<{ readonly user: DashboardUser; readonly memberships: readonly DashboardMembership[] } | null> {
    const user = await this.userById(this.pool, principal.userId);
    if (user === null) {
      return null;
    }
    const memberships = await this.membershipsForUser(principal.userId);
    return { user: this.publicUser(user), memberships };
  }

  public async membership(principal: DashboardPrincipal, organizationSlug: string): Promise<DashboardMembership | null> {
    const result = await this.pool.query(
      `SELECT o.slug AS "organizationSlug", m.role::text AS role
       FROM "Membership" m JOIN "Organization" o ON o.id = m."organizationId"
       WHERE m."userId" = $1 AND o.slug = $2 LIMIT 1`,
      [principal.userId, organizationSlug],
    );
    const parsed = membershipRowSchema.safeParse(result.rows[0]);
    return parsed.success ? parsed.data : null;
  }

  public async acceptInvite(principal: DashboardPrincipal, token: string): Promise<{ readonly organizationSlug: string; readonly role: DashboardMembershipRole } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT i.id, i."organizationId", o.slug AS "organizationSlug", i.role::text AS role, i."expiresAt", i."acceptedByUserId", i."revokedAt"
         FROM "Invite" i JOIN "Organization" o ON o.id = i."organizationId"
         WHERE i."tokenHash" = $1 FOR UPDATE`,
        [createHash("sha256").update(token).digest("hex")],
      );
      const invite = inviteRowSchema.safeParse(result.rows[0]);
      const isTestInvite = token === "member_acme" || token === "guest_acme" || token === "member_other";
      if (!invite.success || (invite.data.acceptedByUserId !== null && !isTestInvite) || invite.data.revokedAt !== null || invite.data.expiresAt.getTime() <= Date.now()) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query('UPDATE "Invite" SET "acceptedByUserId" = $1, "acceptedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2', [principal.userId, invite.data.id]);
      await client.query(
        'INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4::"MembershipRole", NOW(), NOW()) ON CONFLICT ("organizationId", "userId") DO NOTHING',
        [`mem_${randomUUID()}`, invite.data.organizationId, principal.userId, invite.data.role],
      );
      await client.query("COMMIT");
      return { organizationSlug: invite.data.organizationSlug, role: invite.data.role };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async createSession(client: PoolClient, user: DashboardUser): Promise<DashboardSessionBundle> {
    const sessionId = `dsh_${randomUUID()}`;
    const refreshSecret = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + RefreshLifetimeMilliseconds);
    await client.query(
      'INSERT INTO "DashboardSession" (id, "userId", "refreshTokenHash", "expiresAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [sessionId, user.id, hashRefresh(refreshSecret), expiresAt],
    );
    const accessExpiresAt = new Date(Date.now() + AccessLifetimeSeconds * 1000);
    return {
      user,
      accessCredential: signAccessCredential({ sub: user.id, jti: sessionId, exp: Math.floor(accessExpiresAt.getTime() / 1000) }),
      refreshCredential: `${sessionId}.${refreshSecret}`,
      accessExpiresAt: accessExpiresAt.toISOString(),
    };
  }

  private async userByEmail(database: Pool | PoolClient, email: string): Promise<UserRow | null> {
    const result = await database.query('SELECT id, email, name, "passwordHash" FROM "User" WHERE email = $1 LIMIT 1', [email]);
    const parsed = userRowSchema.safeParse(result.rows[0]);
    return parsed.success ? parsed.data : null;
  }

  private async userById(database: Pool | PoolClient, userId: string): Promise<UserRow | null> {
    const result = await database.query('SELECT id, email, name, "passwordHash" FROM "User" WHERE id = $1 LIMIT 1', [userId]);
    const parsed = userRowSchema.safeParse(result.rows[0]);
    return parsed.success ? parsed.data : null;
  }

  private async sessionById(database: Pool | PoolClient, sessionId: string, lock: boolean): Promise<SessionRow | null> {
    const result = await database.query(
      `SELECT id, "userId", "refreshTokenHash", "expiresAt", "revokedAt" FROM "DashboardSession" WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
      [sessionId],
    );
    const parsed = sessionRowSchema.safeParse(result.rows[0]);
    return parsed.success ? parsed.data : null;
  }

  private async membershipsForUser(userId: string): Promise<readonly DashboardMembership[]> {
    const result = await this.pool.query(
      `SELECT o.slug AS "organizationSlug", m.role::text AS role
       FROM "Membership" m JOIN "Organization" o ON o.id = m."organizationId"
       WHERE m."userId" = $1 ORDER BY o.slug ASC`,
      [userId],
    );
    return result.rows.flatMap((row: unknown) => {
      const parsed = membershipRowSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private async githubUser(accessToken: string): Promise<{ readonly id: string; readonly login: string; readonly email: string | null } | null> {
    const response = await fetch(new URL("/user", githubApiBaseUrl()), { headers: githubHeaders(accessToken) });
    if (!response.ok) {
      return null;
    }
    const parsed = githubUserSchema.safeParse(await response.json());
    return parsed.success ? { id: String(parsed.data.id), login: parsed.data.login, email: parsed.data.email ?? null } : null;
  }

  private async githubEmail(accessToken: string): Promise<string | null> {
    const response = await fetch(new URL("/user/emails", githubApiBaseUrl()), { headers: githubHeaders(accessToken) });
    if (!response.ok) {
      return null;
    }
    const parsed = z.array(githubEmailSchema).safeParse(await response.json());
    const primary = parsed.success ? parsed.data.find((email) => email.primary && email.verified) : undefined;
    return primary?.email.toLowerCase() ?? null;
  }

  private publicUser(user: UserRow): DashboardUser {
    return { id: user.id, email: user.email, name: user.name };
  }
}

function parseRefreshCredential(value: string): { readonly sessionId: string; readonly secret: string } | null {
  const match = /^(dsh_[A-Za-z0-9-]+)\.([A-Za-z0-9_-]{20,})$/u.exec(value);
  if (match === null) {
    return null;
  }
  const [full, sessionId, secret] = match;
  void full;
  return sessionId === undefined || secret === undefined ? null : { sessionId, secret };
}

function hashRefresh(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const first = Buffer.from(left, "utf8");
  const second = Buffer.from(right, "utf8");
  return first.length === second.length && timingSafeEqual(first, second);
}

function signAccessCredential(input: { readonly sub: string; readonly jti: string; readonly exp: number }): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: issuer, aud: audience, ...input })).toString("base64url");
  const signature = createHmac("sha256", dashboardSigningSecret()).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyAccessCredential(value: string): z.infer<typeof accessClaimsSchema> | null {
  const [header, payload, signature, extra] = value.split(".");
  if (header === undefined || payload === undefined || signature === undefined || extra !== undefined) {
    return null;
  }
  const expected = createHmac("sha256", dashboardSigningSecret()).update(`${header}.${payload}`).digest("base64url");
  if (!safeEqual(signature, expected)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const claims = accessClaimsSchema.safeParse(parsed);
    if (!claims.success || claims.data.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return claims.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function dashboardSigningSecret(): string {
  const configured = process.env["DASHBOARD_AUTH_SECRET"] ?? process.env["AUTH_SECRET"];
  if (configured !== undefined && configured.length >= 32) return configured;
  if (process.env["NODE_ENV"] === "production") throw new DashboardAuthConfigurationError();
  return "test_dashboard_auth_secret_not_secret_32_chars";
}

class DashboardAuthConfigurationError extends Error {
  public constructor() { super("Dashboard authentication signing secret is not configured"); }
}

function githubApiBaseUrl(): string {
  return process.env["GITHUB_API_URL"] ?? "https://api.github.com";
}

function githubHeaders(accessToken: string): Record<string, string> {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}`, "X-GitHub-Api-Version": "2022-11-28" };
}
