import { latestVersion, listDashboardDocs, type DashboardDoc } from "@/entities/dashboard";
import { CreateDocModal } from "@/features/create-doc";
import { canManage, requireDashboardRead } from "@/shared/auth/dashboard-access";
import { dashboardShell } from "@/widgets/dashboard-shell";
import { VersionStatusBadge } from "@/entities/dashboard";
import { DashboardPageHeader } from "@/shared/ui/dashboard-primitives";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

type DashboardStats = {
  readonly docs: number;
  readonly publicDocs: number;
  readonly privateDocs: number;
  readonly readyVersions: number;
  readonly activeVersions: number;
};

function buildStats(docs: readonly DashboardDoc[]): DashboardStats {
  return docs.reduce<DashboardStats>(
    (stats, doc) => {
      const latest = latestVersion(doc);
      return {
        docs: stats.docs + 1,
        publicDocs: stats.publicDocs + (doc.visibility === "public" ? 1 : 0),
        privateDocs: stats.privateDocs + (doc.visibility === "private" ? 1 : 0),
        readyVersions: stats.readyVersions + (latest?.status === "ready" ? 1 : 0),
        activeVersions: stats.activeVersions + (latest === null ? 0 : 1),
      };
    },
    { docs: 0, publicDocs: 0, privateDocs: 0, readyVersions: 0, activeVersions: 0 }
  );
}

export async function OrganizationDashboardPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const docs = await listDashboardDocs(org);
  const stats = buildStats(docs);
  const mayManage = canManage(membership.role);
  const recentDocs = docs.slice(0, 4);

  function renderVersionStatusBadge(doc: DashboardDoc) {
    const latest = latestVersion(doc);
    if (latest === null) {
      return <VersionStatusBadge />;
    }

    return <VersionStatusBadge label={latest.label} status={latest.status} />;
  }

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    tab: "overview",
    children: (
      <div className="flex flex-col gap-4 p-6">
        <DashboardPageHeader
          kicker="Workspace"
          title={org}
          description="Docs, deploys, versions, and publication status in one operating view."
          actions={
            <>
              {mayManage ? <CreateDocModal org={org} /> : null}
              <a
                className="inline-flex h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon transition-colors hover:border-carbon hover:bg-fog"
                href={`/app/${org}/docs`}
              >
                Browse docs
              </a>
            </>
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-chalk bg-paper p-6 transition-colors hover:border-signal-orange">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate">Total docs</span>
            <strong className="mt-1 block font-polysans text-4xl font-bold text-carbon">{stats.docs}</strong>
            <p className="mt-2 text-xs text-graphite">
              {stats.publicDocs} public, {stats.privateDocs} private
            </p>
          </div>
          <div className="rounded-lg border border-chalk bg-paper p-6 transition-colors hover:border-signal-orange">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate">Deploy coverage</span>
            <strong className="mt-1 block font-polysans text-4xl font-bold text-carbon">{stats.activeVersions}</strong>
            <p className="mt-2 text-xs text-graphite">Docs with at least one version</p>
          </div>
          <div className="rounded-lg border border-chalk bg-paper p-6 transition-colors hover:border-signal-orange">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate">Ready latest</span>
            <strong className="mt-1 block font-polysans text-4xl font-bold text-carbon">{stats.readyVersions}</strong>
            <p className="mt-2 text-xs text-graphite">Latest versions ready to publish</p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <section className="flex flex-col gap-5 rounded-lg border border-chalk bg-paper p-6   lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-signal-orange">Primary surface</p>
                <h2 className="mt-1 font-polysans text-2xl font-bold tracking-tight text-carbon">Documentation portals</h2>
              </div>
              <a className="text-sm font-semibold text-signal-orange hover:underline" href={`/app/${org}/docs`}>
                View all
              </a>
            </div>

            {recentDocs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-chalk p-8 text-center">
                <h3 className="text-lg font-semibold text-carbon">No docs yet</h3>
                <p className="max-w-sm text-sm text-graphite">
                  Create the first portal to unlock deploys, version history, diffs, and public documentation.
                </p>
                {mayManage ? <CreateDocModal org={org} triggerLabel="Create first doc" /> : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {recentDocs.map((doc) => (
                  <a
                    className="flex items-center justify-between rounded-lg border border-chalk bg-fog p-5 transition-colors hover:border-signal-orange hover:bg-chalk"
                    href={`/app/${org}/docs/${doc.slug}`}
                    key={doc.slug}
                  >
                    <span className="flex flex-col gap-1">
                      <strong className="text-base font-semibold text-carbon">{doc.name}</strong>
                      <small className="text-xs text-slate">
                        {doc.slug} / {doc.theme}
                      </small>
                    </span>
                    {renderVersionStatusBadge(doc)}
                  </a>
                ))}
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-5 rounded-lg border border-chalk bg-paper p-6  ">
            <div className="border-b border-chalk pb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-signal-orange">Next actions</p>
              <h2 className="mt-1 font-polysans text-2xl font-bold tracking-tight text-carbon">Operate faster</h2>
            </div>
            <nav aria-label="Dashboard shortcuts" className="flex flex-col gap-3">
              {mayManage ? (
                <div className="rounded-lg border border-chalk bg-fog p-4">
                  <p className="mb-3 text-sm font-medium text-carbon">Create a documentation portal</p>
                  <CreateDocModal org={org} triggerClassName="w-full" triggerLabel="New doc" />
                </div>
              ) : null}
              <a
                className="flex items-center justify-between rounded-lg border border-chalk bg-fog p-4 text-sm font-medium text-carbon transition-colors hover:border-signal-orange hover:bg-chalk"
                href={`/app/${org}/docs`}
              >
                <span>Review portals</span>
                <span className="font-polysans font-bold text-signal-orange">→</span>
              </a>
              {recentDocs[0] ? (
                <a
                  className="flex items-center justify-between rounded-lg border border-chalk bg-fog p-4 text-sm font-medium text-carbon transition-colors hover:border-signal-orange hover:bg-chalk"
                  href={recentDocs[0].publicUrl}
                  target="_blank"
                >
                  <span>Open public docs</span>
                  <span className="font-polysans font-bold text-signal-orange">→</span>
                </a>
              ) : (
                <div
                  className="flex cursor-not-allowed items-center justify-between rounded-lg border border-chalk bg-fog p-4 text-sm font-medium text-slate opacity-50"
                  title="No documentation portals are available yet."
                >
                  <span>Open public docs</span>
                  <span className="font-polysans font-bold text-slate">→</span>
                </div>
              )}
              <a
                className="flex items-center justify-between rounded-lg border border-chalk bg-fog p-4 text-sm font-medium text-carbon transition-colors hover:border-signal-orange hover:bg-chalk"
                href={`/app/${org}/docs`}
              >
                <span>Check latest statuses</span>
                <span className="font-polysans font-bold text-signal-orange">→</span>
              </a>
            </nav>
          </aside>
        </div>
      </div>
    ),
  });
}
