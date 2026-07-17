import {
  dashboardCreateInvite, dashboardDeleteInvite, dashboardDeleteMember, dashboardInvites, dashboardMembers, dashboardUpdateMember,
  type DashboardInviteDto, type DashboardMemberDto,
} from "@/shared/api/dashboard-management-client";

export type DashboardMember = DashboardMemberDto;
export type DashboardInvite = DashboardInviteDto;

export const listDashboardMembers = dashboardMembers;
export const listDashboardInvites = dashboardInvites;
export const deleteDashboardMember = dashboardDeleteMember;
export const revokeDashboardInvite = dashboardDeleteInvite;

export async function updateDashboardMemberRole(organizationSlug: string, membershipId: string, role: string): Promise<void> {
  await dashboardUpdateMember(organizationSlug, membershipId, role);
}

export async function createDashboardInvite(organizationSlug: string, createdByEmail: string, email: string | null, role: string): Promise<{ readonly id: string; readonly token: string; readonly invite: DashboardInvite }> {
  void createdByEmail;
  return dashboardCreateInvite(organizationSlug, email, role);
}
