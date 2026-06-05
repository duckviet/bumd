import { z } from "zod";
import { hashPassword, verifyPassword } from "./password";

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

type AuthState = {
  readonly usersByEmail: Map<string, AuthUser>;
  readonly memberships: Membership[];
  readonly invitesByToken: Map<string, Invite>;
  nextUserId: number;
  seededInvites: string;
};

const inviteSchema = z.object({
  token: z.string().min(1),
  organizationSlug: z.string().min(1),
  role: z.union([z.literal("owner"), z.literal("admin"), z.literal("member"), z.literal("guest")]),
  expiresAt: z.string().datetime(),
});

declare global {
  var __bumdAuthState: AuthState | undefined;
}

export async function registerUser(input: {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}): Promise<AuthUser> {
  const state = authState();
  const email = normalizeEmail(input.email);
  const existing = state.usersByEmail.get(email);
  if (existing !== undefined) {
    return existing;
  }
  const user: AuthUser = {
    id: `usr_${state.nextUserId}`,
    email,
    name: input.name.trim() === "" ? email : input.name.trim(),
    passwordHash: await hashPassword(input.password),
  };
  state.nextUserId += 1;
  state.usersByEmail.set(email, user);
  ensureMembership(user.id, "personal", MembershipRole.Owner);
  return user;
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const user = authState().usersByEmail.get(normalizeEmail(email));
  if (user === undefined) {
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export function getUserByEmail(email: string): AuthUser | null {
  return authState().usersByEmail.get(normalizeEmail(email)) ?? null;
}

export function membershipsForUser(userId: string): readonly Membership[] {
  return authState().memberships.filter((membership) => membership.userId === userId);
}

export function membershipForOrg(userId: string, organizationSlug: string): Membership | null {
  return authState().memberships.find((membership) => membership.userId === userId && membership.organizationSlug === organizationSlug) ?? null;
}

export function acceptInvite(token: string, userId: string): { readonly kind: "accepted"; readonly organizationSlug: string; readonly role: MembershipRole } | { readonly kind: "invalid" } {
  const invite = authState().invitesByToken.get(token);
  if (invite === undefined || invite.acceptedByUserId !== undefined || Date.parse(invite.expiresAt) <= Date.now()) {
    return { kind: "invalid" };
  }
  invite.acceptedByUserId = userId;
  ensureMembership(userId, invite.organizationSlug, invite.role);
  return { kind: "accepted", organizationSlug: invite.organizationSlug, role: invite.role };
}

function ensureMembership(userId: string, organizationSlug: string, role: MembershipRole): void {
  const state = authState();
  const existing = state.memberships.find((membership) => membership.userId === userId && membership.organizationSlug === organizationSlug);
  if (existing === undefined) {
    state.memberships.push({ userId, organizationSlug, role });
  }
}

function authState(): AuthState {
  const seed = process.env["BUMD_AUTH_TEST_INVITES"] ?? "";
  const existing = globalThis.__bumdAuthState;
  if (existing !== undefined && existing.seededInvites === seed) {
    return existing;
  }
  const state: AuthState = {
    usersByEmail: new Map(),
    memberships: [],
    invitesByToken: new Map(),
    nextUserId: 1,
    seededInvites: seed,
  };
  seedInvites(state, seed);
  globalThis.__bumdAuthState = state;
  return state;
}

function seedInvites(state: AuthState, value: string): void {
  for (const row of value.split(",")) {
    const [token, organizationSlug, role, ...expiresAtParts] = row.split(":");
    const expiresAt = expiresAtParts.join(":");
    if (token === undefined || organizationSlug === undefined || role === undefined || expiresAt === "") {
      continue;
    }
    const parsed = inviteSchema.safeParse({ token, organizationSlug, role, expiresAt });
    if (parsed.success) {
      state.invitesByToken.set(parsed.data.token, parsed.data);
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase();
}
