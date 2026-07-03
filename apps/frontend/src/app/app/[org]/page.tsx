import { latestVersion, listDashboardDocs, type DashboardDoc } from "../../../entities/dashboard/dashboard-store";
import { canManage, dashboardShell, requireDashboardRead } from "./docs/dashboard-helpers";
import { CreateDocModal } from "./docs/create-doc-modal";

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

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    children: (
      <div className="dashboard-workspace">
        <section className="dashboard-hero">
          <div>
            <p className="dashboard-kicker">Workspace</p>
            <h1>{org}</h1>
            <p className="dashboard-lede">Docs, deploys, versions, and publication status are now reachable from one operating view.</p>
          </div>
          <div className="dashboard-hero-actions">
            {mayManage ? <CreateDocModal org={org} /> : null}
            <a className="button-link button-secondary" href={`/app/${org}/docs`}>
              Browse docs
            </a>
          </div>
        </section>

        <section className="dashboard-metrics" aria-label="Workspace summary">
          <article>
            <span>Total docs</span>
            <strong>{stats.docs}</strong>
            <p>{stats.publicDocs} public, {stats.privateDocs} private</p>
          </article>
          <article>
            <span>Deploy coverage</span>
            <strong>{stats.activeVersions}</strong>
            <p>Docs with at least one version</p>
          </article>
          <article>
            <span>Ready latest</span>
            <strong>{stats.readyVersions}</strong>
            <p>Latest versions ready to publish</p>
          </article>
        </section>

        <div className="dashboard-grid">
          <section className="dashboard-panel dashboard-panel-large">
            <div className="dashboard-section-header">
              <div>
                <p className="dashboard-kicker">Primary surface</p>
                <h2>Documentation portals</h2>
              </div>
              <a className="dashboard-inline-link" href={`/app/${org}/docs`}>
                View all
              </a>
            </div>
            {recentDocs.length === 0 ? (
              <div className="dashboard-empty">
                <h3>No docs yet</h3>
                <p>Create the first portal to unlock deploys, version history, diffs, and public documentation.</p>
                {mayManage ? <CreateDocModal org={org} /> : null}
              </div>
            ) : (
              <div className="dashboard-doc-table">
                {recentDocs.map((doc) => (
                  <a className="dashboard-doc-row" href={`/app/${org}/docs/${doc.slug}`} key={doc.slug}>
                    <span>
                      <strong>{doc.name}</strong>
                      <small>{doc.slug} / {doc.theme}</small>
                    </span>
                    <span className="dashboard-status">{latestLabel(doc)}</span>
                  </a>
                ))}
              </div>
            )}
          </section>

          <aside className="dashboard-panel dashboard-quick-panel">
            <div className="dashboard-section-header">
              <div>
                <p className="dashboard-kicker">Next actions</p>
                <h2>Operate faster</h2>
              </div>
            </div>
            <nav className="dashboard-action-list" aria-label="Dashboard shortcuts">
              <a href={`/app/${org}/docs/new`}>Upload a spec</a>
              <a href={`/app/${org}/docs`}>Review portals</a>
              <a href={`/docs/${org}`}>Open public docs</a>
              <a href={`/app/${org}/docs`}>Check latest statuses</a>
            </nav>
          </aside>
        </div>
      </div>
    ),
  });
}
