import {
  dashboardCreateWebhook, dashboardDeleteWebhook, dashboardRotateWebhook, dashboardUpdateWebhook, dashboardWebhookDeliveries, dashboardWebhooks,
  type DashboardWebhookDeliveryDto, type DashboardWebhookDto,
} from "@/shared/api/dashboard-management-client";

export type DashboardWebhook = DashboardWebhookDto;
export type DashboardWebhookDelivery = DashboardWebhookDeliveryDto;

export const listDashboardWebhooks = dashboardWebhooks;
export const deleteDashboardWebhook = dashboardDeleteWebhook;
export const listDashboardWebhookDeliveries = dashboardWebhookDeliveries;

export async function createDashboardWebhook(organizationSlug: string, url: string, description: string | null, eventTypes: string[]): Promise<{ readonly id: string; readonly secret: string; readonly webhook: DashboardWebhook }> {
  return dashboardCreateWebhook(organizationSlug, url, description, eventTypes);
}

export async function updateDashboardWebhook(organizationSlug: string, webhookId: string, data: { readonly url: string; readonly enabled: boolean; readonly eventTypes: string[] }): Promise<DashboardWebhook> {
  return dashboardUpdateWebhook(organizationSlug, webhookId, data);
}

export async function rotateDashboardWebhookSecret(organizationSlug: string, webhookId: string): Promise<{ readonly secret: string }> {
  return dashboardRotateWebhook(organizationSlug, webhookId);
}
