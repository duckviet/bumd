import { latestVersion, listDashboardDocs } from "../../../../entities/dashboard/dashboard-store";
import { canManage, dashboardShell, requireDashboardRead } from "./dashboard-helpers";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export default async function DocsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const docs = listDashboardDocs(org);
  const mayManage = canManage(membership.role);
  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    children: (
      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h2>Docs</h2>
            <p>{docs.length} documentation portal{docs.length === 1 ? "" : "s"}</p>
          </div>
          {mayManage ? <a className="button-link" href={`/app/${org}/docs/new`}>New doc</a> : null}
        </div>
        <div className="dashboard-list">
          {docs.map((doc) => {
            const latest = latestVersion(doc);
            return (
              <article className="dashboard-row" key={doc.slug}>
                <div>
                  <h3><a href={`/app/${org}/docs/${doc.slug}`}>{doc.name}</a></h3>
                  <p>{doc.slug} · {doc.visibility} · latest status: {latest?.status ?? "no versions"}</p>
                </div>
                <div className="dashboard-actions">
                  <a href={`/app/${org}/docs/${doc.slug}/versions`}>Versions</a>
                  {mayManage ? <a href={`/app/${org}/docs/${doc.slug}/settings`}>Settings</a> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    ),
  });
}
