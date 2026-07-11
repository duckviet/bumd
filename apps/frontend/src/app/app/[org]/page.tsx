import { latestVersion, listDashboardDocs, type DashboardDoc } from "@/entities/dashboard";
import { canManage, dashboardShell, requireDashboardRead } from "@/app/app/[org]/docs/dashboard-helpers";
import { CreateDocModal } from "@/app/app/[org]/docs/create-doc-modal";

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

function latestLabel(doc: DashboardDoc): string {
  const latest = latestVersion(doc);
  return latest === null ? "No deploys" : `${latest.label} ${latest.status}`;
}

export default async function OrganizationDashboard({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const docs = await listDashboardDocs(org);
  const stats = buildStats(docs);
  const mayManage = canManage(membership.role);
  const recentDocs = docs.slice(0, 4);

  function renderStatusBadge(doc: DashboardDoc) {
    const latest = latestVersion(doc);
    if (latest === null) {
      return (
        <span className="px-3 py-0.5 text-xs font-semibold rounded-full border border-chalk bg-fog text-slate uppercase">
          No deploys
        </span>
      );
    }
    
    const isReady = latest.status === "ready";
    const badgeColorClass = isReady
      ? "bg-green-50 text-green-700 border-green-200"
      : latest.status === "failed"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-orange-50 text-orange-700 border-orange-200 animate-pulse";
      
    return (
      <span className={`px-3 py-0.5 text-xs font-semibold rounded-full border uppercase ${badgeColorClass}`}>
        {latest.label} {latest.status}
      </span>
    );
  }

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    tab: "overview",
    children: (
      <div className="dashboard-workspace flex flex-col gap-8">
        <section className="dashboard-hero bg-paper p-6 rounded-lg border border-chalk flex items-center justify-between transition-all">
          <div>
            <p className="dashboard-kicker">Workspace</p>
            <h1 className="text-3xl font-bold tracking-tight text-carbon">{org}</h1>
            <p className="dashboard-lede mt-2 text-graphite">Docs, deploys, versions, and publication status are now reachable from one operating view.</p>
          </div>
          <div className="dashboard-hero-actions flex gap-3">
            {mayManage ? <CreateDocModal org={org} /> : null}
            <a className="button-link button-secondary" href={`/app/${org}/docs`}>
              Browse docs
            </a>
          </div>
        </section>

        <div className="dashboard-facts flex flex-wrap gap-6 mt-0">
          <div className="bg-paper p-6 rounded-lg border border-chalk flex-1 min-w-[200px] hover:border-signal-orange transition-all">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate mb-1 block">Total docs</span>
            <strong className="text-4xl font-bold font-polysans text-carbon block mt-1">{stats.docs}</strong>
            <p className="text-xs text-graphite mt-2">{stats.publicDocs} public, {stats.privateDocs} private</p>
          </div>
          <div className="bg-paper p-6 rounded-lg border border-chalk flex-1 min-w-[200px] hover:border-signal-orange transition-all">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate mb-1 block">Deploy coverage</span>
            <strong className="text-4xl font-bold font-polysans text-carbon block mt-1">{stats.activeVersions}</strong>
            <p className="text-xs text-graphite mt-2">Docs with at least one version</p>
          </div>
          <div className="bg-paper p-6 rounded-lg border border-chalk flex-1 min-w-[200px] hover:border-signal-orange transition-all">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate mb-1 block">Ready latest</span>
            <strong className="text-4xl font-bold font-polysans text-carbon block mt-1">{stats.readyVersions}</strong>
            <p className="text-xs text-graphite mt-2">Latest versions ready to publish</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <section className="lg:col-span-2 bg-paper p-8 rounded-lg border border-chalk flex flex-col gap-6">
            <div className="dashboard-section-header flex items-center justify-between border-b border-chalk pb-4 mb-2">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-signal-orange">Primary surface</p>
                <h2 className="text-2xl font-bold tracking-tight text-carbon mt-1">Documentation portals</h2>
              </div>
              <a className="text-sm font-semibold text-signal-orange hover:underline transition-all" href={`/app/${org}/docs`}>
                View all
              </a>
            </div>
            
            {recentDocs.length === 0 ? (
              <div className="dashboard-empty border-2 border-dashed border-chalk p-8 rounded-lg text-center flex flex-col items-center gap-4">
                <h3 className="text-lg font-semibold text-carbon">No docs yet</h3>
                <p className="text-sm text-graphite max-w-sm">Create the first portal to unlock deploys, version history, diffs, and public documentation.</p>
                {mayManage ? <CreateDocModal org={org} /> : null}
              </div>
            ) : (
              <div className="dashboard-doc-list flex flex-col gap-3.5">
                {recentDocs.map((doc) => (
                  <a 
                    className="flex items-center justify-between p-5 bg-fog hover:bg-chalk border border-chalk hover:border-signal-orange rounded-lg transition-all" 
                    href={`/app/${org}/docs/${doc.slug}`} 
                    key={doc.slug}
                  >
                    <span className="flex flex-col gap-1">
                      <strong className="text-base font-semibold text-carbon">{doc.name}</strong>
                      <small className="text-xs text-slate">{doc.slug} / {doc.theme}</small>
                    </span>
                    {renderStatusBadge(doc)}
                  </a>
                ))}
              </div>
            )}
          </section>

          <aside className="bg-paper p-8 rounded-lg border border-chalk flex flex-col gap-6">
            <div className="border-b border-chalk pb-4">
              <p className="text-xs uppercase tracking-wider font-semibold text-signal-orange">Next actions</p>
              <h2 className="text-2xl font-bold tracking-tight text-carbon mt-1">Operate faster</h2>
            </div>
            <nav className="flex flex-col gap-3" aria-label="Dashboard shortcuts">
              <a href={`/app/${org}/docs/new`} className="flex items-center justify-between p-4 bg-fog hover:bg-chalk border border-chalk hover:border-signal-orange rounded-lg transition-all font-medium text-carbon text-sm">
                <span>Upload a spec</span>
                <span className="text-signal-orange font-bold font-polysans">→</span>
              </a>
              <a href={`/app/${org}/docs`} className="flex items-center justify-between p-4 bg-fog hover:bg-chalk border border-chalk hover:border-signal-orange rounded-lg transition-all font-medium text-carbon text-sm">
                <span>Review portals</span>
                <span className="text-signal-orange font-bold font-polysans">→</span>
              </a>
              {recentDocs[0] ? (
                <a href={recentDocs[0].publicUrl} target="_blank" className="flex items-center justify-between p-4 bg-fog hover:bg-chalk border border-chalk hover:border-signal-orange rounded-lg transition-all font-medium text-carbon text-sm">
                  <span>Open public docs</span>
                  <span className="text-signal-orange font-bold font-polysans">→</span>
                </a>
              ) : (
                <div className="flex items-center justify-between p-4 bg-fog opacity-50 border border-chalk rounded-lg font-medium text-slate text-sm cursor-not-allowed" title="No documentation portals are available yet.">
                  <span>Open public docs</span>
                  <span className="font-bold font-polysans text-slate">→</span>
                </div>
              )}
              <a href={`/app/${org}/docs`} className="flex items-center justify-between p-4 bg-fog hover:bg-chalk border border-chalk hover:border-signal-orange rounded-lg transition-all font-medium text-carbon text-sm">
                <span>Check latest statuses</span>
                <span className="text-signal-orange font-bold font-polysans">→</span>
              </a>
            </nav>
          </aside>
        </div>
      </div>
    ),
  });
}
