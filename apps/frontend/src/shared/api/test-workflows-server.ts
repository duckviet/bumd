import { z } from "zod";
import { dashboardCredentials } from "@/shared/auth/dashboard-credentials";
import { backendBaseUrl } from "@/shared/config/env";
import { DashboardManagementError } from "./dashboard-management-client";
import type { TestEnvironmentDto } from "./test-workflow-types";

const testEnvironmentVariableSchema = z.object({
  id: z.string(),
  key: z.string(),
  secret: z.boolean(),
  hasValue: z.boolean(),
});

const testEnvironmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  variables: z.array(testEnvironmentVariableSchema),
});

export async function listTestEnvironmentsServer(input: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
}): Promise<TestEnvironmentDto[]> {
  const credentials = await dashboardCredentials();
  if (credentials === null) {
    throw new DashboardManagementError(401);
  }

  const url = new URL(
    `/v1/orgs/${segment(input.orgSlug)}/docs/${segment(input.docSlug)}/branches/${segment(input.branchSlug)}/test-environments`,
    backendBaseUrl(),
  );

  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${credentials.dashboardAccessCredential}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new DashboardManagementError(response.status);
  }

  return z.array(testEnvironmentSchema).parse(await response.json());
}

function segment(value: string): string {
  return encodeURIComponent(value);
}
