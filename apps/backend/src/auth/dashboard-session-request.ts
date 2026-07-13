import type { DashboardPrincipal } from "./dashboard-auth-types.js";

export type DashboardSessionRequest = {
  readonly headers: {
    readonly authorization?: string;
  };
  dashboardPrincipal?: DashboardPrincipal;
};
