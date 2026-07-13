import { cookies } from "next/headers";
import { getToken } from "next-auth/jwt";
import { z } from "zod";

const credentialSchema = z.object({
  dashboardAccessCredential: z.string().min(1),
  dashboardRefreshCredential: z.string().min(1),
  dashboardAccessExpiresAt: z.string().datetime(),
});

export type DashboardCredentials = z.infer<typeof credentialSchema>;

export async function dashboardCredentials(): Promise<DashboardCredentials | null> {
  const cookieStore = await cookies();
  const request = new Request("http://dashboard.internal", { headers: { cookie: cookieStore.toString() } });
  const token = await getToken({ req: request, secret: authSecret() });
  const parsed = credentialSchema.safeParse(token);
  return parsed.success ? parsed.data : null;
}

function authSecret(): string {
  return process.env["AUTH_SECRET"] ?? "test_auth_secret_not_secret_32_chars";
}
