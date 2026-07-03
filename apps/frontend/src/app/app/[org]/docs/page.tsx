import { latestVersion, listDashboardDocs, type DashboardDoc } from "../../../../entities/dashboard/dashboard-store";
import { canManage, dashboardShell, requireDashboardRead } from "./dashboard-helpers";
import { CreateDocModal } from "./create-doc-modal";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

function versionSummary(doc: DashboardDoc): string {
  const latest = latestVersion(doc);
  return latest === null ? "No versions" : `${latest.label} / ${latest.status}`;
}

export default async function DocsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const docs = await listDashboardDocs(org);
  const mayManage = canManage(membership.role);

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    children: (
      <div className="dashboard-workspace">
        <section className="dashboard-hero dashboard-hero-compact">
          <div>
            <p className="dashboard-kicker">Portals</p>
            <h1>Docs dashboard</h1>
            <p className="dashboard-lede">Open a portal, inspect its latest version, or jump straight into deploy and settings from this list.</p>
          </div>
          <div className="dashboard-hero-actions">
            {mayManage ? <CreateDocModal org={org} /> : null}
            <a className="button-link button-secondary" href={`/app/${org}`}>
              Overview
            </a>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="dashboard-kicker">{docs.length} portal{docs.length === 1 ? "" : "s"}</p>
              <h2>Manage documentation</h2>
            </div>
          </div>
          {docs.length === 0 ? (
            <div className="dashboard-empty">
              <h3>No docs yet</h3>
              <p>Create a portal to start tracking immutable versions, diffs, and public render output.</p>
              {mayManage ? <CreateDocModal org={org} /> : null}
            </div>
          ) : (
            <div className="dashboard-doc-table dashboard-doc-table-expanded">
              {docs.map((doc) => (
                <article className="dashboard-doc-row" key={doc.slug}>
                  <a href={`/app/${org}/docs/${doc.slug}`}>
                    <strong>{doc.name}</strong>
                    <small>{doc.slug} / {doc.visibility} / {doc.theme}</small>
                  </a>
                  <span className="dashboard-status">{versionSummary(doc)}</span>
                  <div className="dashboard-row-actions">
                    <a href={`/app/${org}/docs/${doc.slug}/versions`}>Versions</a>
                    {mayManage ? <a href={`/app/${org}/docs/${doc.slug}/settings`}>Settings</a> : null}
                    <a href={doc.publicUrl}>Public</a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    ),
  });
}
