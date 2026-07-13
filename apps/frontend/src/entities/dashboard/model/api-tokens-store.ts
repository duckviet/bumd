import { dashboardApiTokens, dashboardCreateApiToken, dashboardRevokeApiToken, type DashboardApiTokenDto } from "@/shared/api/dashboard-management-client";

export type DashboardApiToken = DashboardApiTokenDto;
export const listDashboardApiTokens = dashboardApiTokens;
export const revokeDashboardApiToken = dashboardRevokeApiToken;

export async function createDashboardApiToken(organizationSlug: string, name: string, role: string, scopes: string[]): Promise<{ readonly token: string; readonly apiToken: DashboardApiToken }> {
  return dashboardCreateApiToken(organizationSlug, name, role, scopes);
}
