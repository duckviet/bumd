import { notFound } from "next/navigation";
import { dashboardDiffDetail } from "@/shared/api/dashboard-management-client";
import { requireDashboardRead } from "@/shared/auth/dashboard-access";
import { dashboardShell } from "@/widgets/dashboard-shell";
import { z } from "zod";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly versionId: string;
  }>;
};

const dbChangeSchema = z.object({
  breaking: z.boolean().optional(),
  level: z.string(),
  message: z.string(),
  path: z.string(),
  type: z.string(),
});

type DbChange = z.infer<typeof dbChangeSchema>;

function parseChanges(value: unknown): readonly DbChange[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const result = z.array(dbChangeSchema).safeParse(parsed);
    return result.success ? result.data : [];
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

function isBreakingChange(change: DbChange): boolean {
  return change.level === "breaking" || change.breaking === true;
}

export async function DiffDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc: docSlug, versionId } = await params;
  const { session, membership } = await requireDashboardRead(org);

  const diff = await dashboardDiffDetail(org, docSlug, versionId);
  if (diff === null) {
    notFound();
  }
  const version = { docName: diff.docName, sequenceNumber: diff.sequenceNumber };

  // Safely extract changes
  const parsedChanges = parseChanges(diff.changes);
  const breakingChanges = parsedChanges.filter(isBreakingChange);
  const nonBreakingChanges = parsedChanges.filter((change) => !isBreakingChange(change));

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    children: (
      <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-6">
        <section className="flex flex-col justify-between gap-5 rounded-lg border border-chalk bg-paper p-6 sm:flex-row">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">{version.docName} / Version v{version.sequenceNumber} / Diff</p>
            <h1>Diff Analysis Report</h1>
            <p className="text-graphite">
              Showing detailed OpenAPI changes detected against the previous baseline version.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <a href={`/app/${org}/docs/${docSlug}/versions/${versionId}`} className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog">
              Back to Version Details
            </a>
          </div>
        </section>

        <section className="rounded-lg border border-chalk bg-paper p-5  ">
          <h2>Summary</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-chalk bg-fog p-4">
              <span className="text-xs font-bold uppercase text-slate">Classification</span>
              <strong className={`mt-1 block text-xl ${diff.hasBreaking ? "text-red-700" : "text-green-700"}`}>
                {diff.classification.replace("_", " ").toUpperCase()}
              </strong>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <span className="text-xs font-bold uppercase text-red-700">Breaking Changes</span>
              <strong className="mt-1 block text-2xl text-red-700">
                {breakingChanges.length}
              </strong>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <span className="text-xs font-bold uppercase text-green-800">Non-breaking Changes</span>
              <strong className="mt-1 block text-2xl text-green-800">
                {nonBreakingChanges.length}
              </strong>
            </div>
          </div>
        </section>

        {breakingChanges.length > 0 && (
          <section className="rounded-lg border border-red-200 bg-paper p-5  ">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
              <h2 className="text-red-700">Breaking Changes ({breakingChanges.length})</h2>
              <p>These changes require immediate attention as they break contract compatibility.</p>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {breakingChanges.map((change, index) => (
                <div className="rounded-r-lg border border-l-4 border-red-200 border-l-red-700 bg-red-50 px-4 py-3" key={`${change.path}-${index}`}>
                  <div className="mb-1 flex gap-2 text-xs font-bold uppercase text-red-700">
                    <span>{change.type || "Modified"}</span>
                    <span>•</span>
                    <span className="font-mono">{change.path}</span>
                  </div>
                  <p className="text-sm text-graphite">{change.message}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-chalk bg-paper p-5  ">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
            <h2>All Changes ({parsedChanges.length})</h2>
            <p>Complete list of modifications between spec versions.</p>
          </div>
          {parsedChanges.length === 0 ? (
            <div className="mt-4">
              <pre className="whitespace-pre-wrap rounded-lg border border-chalk bg-fog p-4 font-mono text-sm text-carbon">
                {diff.diffMarkdown || "No detailed change list found."}
              </pre>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {parsedChanges.map((change, index) => {
                const isBreaking = isBreakingChange(change);
                return (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-chalk bg-paper p-3" key={`${change.path}-${index}`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex min-h-5 items-center rounded-full border px-2 text-xs font-bold ${isBreaking ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
                          {isBreaking ? "breaking" : "compatible"}
                        </span>
                        <code className="break-all text-sm font-bold text-graphite">{change.path}</code>
                      </div>
                      <p className="mt-1 text-sm text-carbon">{change.message}</p>
                    </div>
                    <span className="text-xs font-bold uppercase text-slate">
                      {change.type || "Update"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    ),
  });
}
