import { z } from "zod";
import { DashboardManagementError, dashboardCreateDoc, dashboardDeleteDoc, dashboardDoc, dashboardDocs, dashboardUpdateDoc, type DashboardDocDto } from "@/shared/api/dashboard-management-client";

export const DocVisibility = { Public: "public", Private: "private" } as const;
export type DocVisibility = (typeof DocVisibility)[keyof typeof DocVisibility];
export const VersionStatus = { Queued: "queued", Processing: "processing", Ready: "ready", Failed: "failed" } as const;
export type VersionStatus = (typeof VersionStatus)[keyof typeof VersionStatus];
export type DashboardVersion = DashboardDocDto["versions"][number];
export type DashboardDoc = DashboardDocDto;

const createDocSchema = z.object({ name: z.string().trim().min(1).max(100), slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), visibility: z.union([z.literal("public"), z.literal("private")]), theme: z.string().trim().min(1).max(64) });
const updateSettingsSchema = z.object({ visibility: z.union([z.literal("public"), z.literal("private")]), theme: z.string().trim().min(1).max(64) });
export type CreateDocInput = z.infer<typeof createDocSchema>;
export type UpdateDocSettingsInput = z.infer<typeof updateSettingsSchema>;

export const listDashboardDocs = dashboardDocs;
export const getDashboardDoc = dashboardDoc;

export async function createDashboardDoc(organizationSlug: string, input: unknown): Promise<{ readonly kind: "created"; readonly doc: DashboardDoc } | { readonly kind: "duplicate" | "invalid" }> {
  const parsed = createDocSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  try { return { kind: "created", doc: await dashboardCreateDoc(organizationSlug, parsed.data) }; }
  catch (error) { if (error instanceof DashboardManagementError && error.statusCode === 409) return { kind: "duplicate" }; throw error; }
}

export async function updateDashboardDocSettings(organizationSlug: string, docSlug: string, input: unknown): Promise<{ readonly kind: "updated"; readonly doc: DashboardDoc } | { readonly kind: "missing" | "invalid" }> {
  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  try { return { kind: "updated", doc: await dashboardUpdateDoc(organizationSlug, docSlug, parsed.data) }; }
  catch (error) { if (error instanceof DashboardManagementError && error.statusCode === 404) return { kind: "missing" }; throw error; }
}

export async function deleteDashboardDoc(organizationSlug: string, docSlug: string): Promise<{ readonly kind: "deleted" } | { readonly kind: "missing" }> {
  try { await dashboardDeleteDoc(organizationSlug, docSlug); return { kind: "deleted" }; }
  catch (error) { if (error instanceof DashboardManagementError && error.statusCode === 404) return { kind: "missing" }; throw error; }
}

function latestFirst(versions: readonly DashboardVersion[]): readonly DashboardVersion[] { return [...versions].sort((left, right) => right.sequenceNumber - left.sequenceNumber); }
export function latestVersion(doc: DashboardDoc): DashboardVersion | null { return latestFirst(doc.versions)[0] ?? null; }
export function versionHistory(doc: DashboardDoc): readonly DashboardVersion[] { return latestFirst(doc.versions); }
