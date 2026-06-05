import { notFound } from "next/navigation";
import { getDashboardDoc, latestVersion, versionHistory } from "../../../../../entities/dashboard/dashboard-store";
import { canManage, dashboardShell, requireDashboardRead } from "../dashboard-helpers";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export default async function DocOverviewPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc: docSlug } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const doc = getDashboardDoc(org, docSlug);
  if (doc === null) {
    notFound();
  }
  const latest = latestVersion(doc);
  const versions = versionHistory(doc);
  const mayManage = canManage(membership.role);
  const statusText = `${doc.visibility} · current status: ${latest?.status ?? "no versions"}`;
  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    children: (
      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h2>{doc.name}</h2>
            <p>{statusText}</p>
          </div>
          <div className="dashboard-actions">
            <a href={doc.publicUrl}>Public URL</a>
            <a href={`/app/${org}/docs/${doc.slug}/versions`}>Versions</a>
            {mayManage ? <a href={`/app/${org}/docs/${doc.slug}/settings`}>Settings</a> : null}
          </div>
        </div>
        <dl className="dashboard-facts">
          <div><dt>Slug</dt><dd>{doc.slug}</dd></div>
          <div><dt>Theme</dt><dd>{doc.theme}</dd></div>
          <div><dt>Latest version</dt><dd>{latest?.label ?? "None"}</dd></div>
          <div><dt>Total versions</dt><dd>{versions.length}</dd></div>
        </dl>
      </section>
    ),
  });
}
