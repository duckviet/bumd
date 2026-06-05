import { z } from "zod";

export const DocVisibility = {
  Public: "public",
  Private: "private",
} as const;

export type DocVisibility = (typeof DocVisibility)[keyof typeof DocVisibility];

export const VersionStatus = {
  Queued: "queued",
  Processing: "processing",
  Ready: "ready",
  Failed: "failed",
} as const;

export type VersionStatus = (typeof VersionStatus)[keyof typeof VersionStatus];

export type DashboardVersion = {
  readonly id: string;
  readonly label: string;
  readonly sequenceNumber: number;
  readonly status: VersionStatus;
  readonly sha256: string;
  readonly createdAt: string;
  readonly readyAt: string | null;
};

export type DashboardDoc = {
  readonly organizationSlug: string;
  readonly slug: string;
  readonly name: string;
  readonly visibility: DocVisibility;
  readonly theme: string;
  readonly publicUrl: string;
  readonly versions: readonly DashboardVersion[];
  readonly createdAt: string;
};

type MutableDashboardDoc = {
  organizationSlug: string;
  slug: string;
  name: string;
  visibility: DocVisibility;
  theme: string;
  publicUrl: string;
  versions: DashboardVersion[];
  createdAt: string;
};

type DashboardState = {
  readonly docs: MutableDashboardDoc[];
};

const createDocSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  visibility: z.union([z.literal("public"), z.literal("private")]),
  theme: z.string().trim().min(1).max(64),
});

const updateSettingsSchema = z.object({
  visibility: z.union([z.literal("public"), z.literal("private")]),
  theme: z.string().trim().min(1).max(64),
});

export type CreateDocInput = z.infer<typeof createDocSchema>;
export type UpdateDocSettingsInput = z.infer<typeof updateSettingsSchema>;

declare global {
  var __bumdDashboardState: DashboardState | undefined;
}

export function listDashboardDocs(organizationSlug: string): readonly DashboardDoc[] {
  return dashboardState().docs.filter((doc) => doc.organizationSlug === organizationSlug).map(readonlyDoc);
}

export function getDashboardDoc(organizationSlug: string, docSlug: string): DashboardDoc | null {
  const doc = dashboardState().docs.find((candidate) => candidate.organizationSlug === organizationSlug && candidate.slug === docSlug);
  return doc === undefined ? null : readonlyDoc(doc);
}

export function createDashboardDoc(organizationSlug: string, input: unknown): { readonly kind: "created"; readonly doc: DashboardDoc } | { readonly kind: "duplicate" | "invalid" } {
  const parsed = createDocSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid" };
  }
  const state = dashboardState();
  const existing = state.docs.find((doc) => doc.organizationSlug === organizationSlug && doc.slug === parsed.data.slug);
  if (existing !== undefined) {
    return { kind: "duplicate" };
  }
  const doc: MutableDashboardDoc = {
    organizationSlug,
    slug: parsed.data.slug,
    name: parsed.data.name,
    visibility: parsed.data.visibility,
    theme: parsed.data.theme,
    publicUrl: `/${organizationSlug}/${parsed.data.slug}`,
    versions: [],
    createdAt: new Date().toISOString(),
  };
  state.docs.push(doc);
  return { kind: "created", doc: readonlyDoc(doc) };
}

export function updateDashboardDocSettings(organizationSlug: string, docSlug: string, input: unknown): { readonly kind: "updated"; readonly doc: DashboardDoc } | { readonly kind: "missing" | "invalid" } {
  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid" };
  }
  const doc = dashboardState().docs.find((candidate) => candidate.organizationSlug === organizationSlug && candidate.slug === docSlug);
  if (doc === undefined) {
    return { kind: "missing" };
  }
  doc.visibility = parsed.data.visibility;
  doc.theme = parsed.data.theme;
  return { kind: "updated", doc: readonlyDoc(doc) };
}

function latestFirst(versions: readonly DashboardVersion[]): readonly DashboardVersion[] {
  return [...versions].sort((left, right) => right.sequenceNumber - left.sequenceNumber);
}

export function latestVersion(doc: DashboardDoc): DashboardVersion | null {
  return latestFirst(doc.versions)[0] ?? null;
}

export function versionHistory(doc: DashboardDoc): readonly DashboardVersion[] {
  return latestFirst(doc.versions);
}

function readonlyDoc(doc: MutableDashboardDoc): DashboardDoc {
  return { ...doc, versions: [...doc.versions] };
}

function dashboardState(): DashboardState {
  if (globalThis.__bumdDashboardState !== undefined) {
    return globalThis.__bumdDashboardState;
  }
  const state: DashboardState = { docs: seedDocs() };
  globalThis.__bumdDashboardState = state;
  return state;
}

function seedDocs(): MutableDashboardDoc[] {
  return [
    {
      organizationSlug: "acme",
      slug: "payments",
      name: "Payments API",
      visibility: DocVisibility.Public,
      theme: "classic",
      publicUrl: "/acme/payments",
      createdAt: "2026-01-01T00:00:00.000Z",
      versions: [
        version("ver_payments_1", "v1", 1, VersionStatus.Ready, "2026-01-01T00:00:00.000Z", "1111"),
        version("ver_payments_2", "v2", 2, VersionStatus.Ready, "2026-02-01T00:00:00.000Z", "2222"),
        version("ver_payments_3", "v3", 3, VersionStatus.Processing, "2026-03-01T00:00:00.000Z", "3333"),
      ],
    },
    {
      organizationSlug: "other",
      slug: "other-api",
      name: "Other API",
      visibility: DocVisibility.Private,
      theme: "contrast",
      publicUrl: "/other/other-api",
      createdAt: "2026-01-15T00:00:00.000Z",
      versions: [version("ver_other_1", "v1", 1, VersionStatus.Ready, "2026-01-15T00:00:00.000Z", "aaaa")],
    },
  ];
}

function version(id: string, label: string, sequenceNumber: number, status: VersionStatus, createdAt: string, sha256: string): DashboardVersion {
  return {
    id,
    label,
    sequenceNumber,
    status,
    sha256,
    createdAt,
    readyAt: status === VersionStatus.Ready ? createdAt : null,
  };
}
