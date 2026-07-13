export const DashboardMembershipRole = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
  Guest: "guest",
} as const;

export type DashboardMembershipRole = (typeof DashboardMembershipRole)[keyof typeof DashboardMembershipRole];

export type DashboardUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
};

export type DashboardMembership = {
  readonly organizationSlug: string;
  readonly role: DashboardMembershipRole;
};

export type DashboardPrincipal = {
  readonly userId: string;
  readonly sessionId: string;
};

export type DashboardSessionBundle = {
  readonly user: DashboardUser;
  readonly accessCredential: string;
  readonly refreshCredential: string;
  readonly accessExpiresAt: string;
};
