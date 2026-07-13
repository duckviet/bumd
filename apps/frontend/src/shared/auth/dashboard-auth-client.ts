import { z } from "zod";
import { backendBaseUrl } from "@/shared/config/env";

const roleSchema = z.union([z.literal("owner"), z.literal("admin"), z.literal("member"), z.literal("guest")]);
const userSchema = z.object({ id: z.string(), email: z.string().email(), name: z.string() });
const membershipSchema = z.object({ organizationSlug: z.string(), role: roleSchema });
const sessionBundleSchema = z.object({
  user: userSchema,
  accessCredential: z.string().min(1),
  refreshCredential: z.string().min(1),
  accessExpiresAt: z.string().datetime(),
});
const currentUserSchema = z.object({ user: userSchema, memberships: z.array(membershipSchema) });
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export type DashboardUser = z.infer<typeof userSchema>;
export type DashboardMembershipRole = z.infer<typeof roleSchema>;
export type DashboardMembership = z.infer<typeof membershipSchema>;
export type DashboardSessionBundle = z.infer<typeof sessionBundleSchema>;

export async function loginDashboard(input: { readonly email: string; readonly password: string }): Promise<DashboardSessionBundle | null> {
  return fetchSessionBundle("/v1/dashboard/auth/login", input);
}

export async function registerDashboard(input: { readonly email: string; readonly password: string; readonly name: string }): Promise<boolean> {
  const response = await fetch(dashboardUrl("/v1/dashboard/auth/register"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (response.ok) {
    return true;
  }
  await safeError(response);
  return false;
}

export async function refreshDashboard(refreshCredential: string): Promise<DashboardSessionBundle | null> {
  return fetchSessionBundle("/v1/dashboard/auth/refresh", { refreshCredential });
}

export async function loginDashboardGithub(githubAccessToken: string): Promise<DashboardSessionBundle | null> {
  return fetchSessionBundle("/v1/dashboard/auth/github", { githubAccessToken });
}

export async function currentDashboardUser(accessCredential: string): Promise<{ readonly user: DashboardUser; readonly memberships: readonly DashboardMembership[] } | null> {
  const response = await fetch(dashboardUrl("/v1/dashboard/me"), {
    headers: { authorization: `Bearer ${accessCredential}` },
    cache: "no-store",
  });
  if (!response.ok) {
    await safeError(response);
    return null;
  }
  const parsed = currentUserSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

export async function acceptDashboardInvite(accessCredential: string, token: string): Promise<{ readonly organizationSlug: string; readonly role: DashboardMembershipRole } | null> {
  const response = await fetch(dashboardUrl("/v1/dashboard/invites/accept"), {
    method: "POST",
    headers: { authorization: `Bearer ${accessCredential}`, "content-type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
  if (!response.ok) {
    await safeError(response);
    return null;
  }
  const parsed = membershipSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

export async function logoutDashboard(accessCredential: string): Promise<void> {
  await fetch(dashboardUrl("/v1/dashboard/auth/logout"), {
    method: "POST",
    headers: { authorization: `Bearer ${accessCredential}` },
    cache: "no-store",
  });
}

async function fetchSessionBundle(path: string, body: Record<string, string>): Promise<DashboardSessionBundle | null> {
  const response = await fetch(dashboardUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    await safeError(response);
    return null;
  }
  const parsed = sessionBundleSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

async function safeError(response: Response): Promise<void> {
  const parsed = errorSchema.safeParse(await response.json());
  void parsed;
}

function dashboardUrl(path: string): string {
  return new URL(path, backendBaseUrl()).toString();
}
