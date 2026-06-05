import { notFound } from "next/navigation";
import { getDashboardDoc, versionHistory } from "../../../../../../entities/dashboard/dashboard-store";
import { dashboardShell, requireDashboardRead } from "../../dashboard-helpers";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export default async function VersionHistoryPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc: docSlug } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const doc = getDashboardDoc(org, docSlug);
  if (doc === null) {
    notFound();
  }
  const versions = versionHistory(doc);
  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    children: (
      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h2>{doc.name} versions</h2>
            <p>Immutable history, newest first</p>
          </div>
          <a href={`/app/${org}/docs/${doc.slug}`}>Overview</a>
        </div>
        <ol className="dashboard-list">
          {versions.map((version) => (
            <li className="dashboard-row" key={version.id}>
              <div>
                <h3>{version.label}</h3>
                <p>{version.status} · sequence {version.sequenceNumber} · sha256 {version.sha256}</p>
              </div>
              <time>{version.createdAt}</time>
            </li>
          ))}
        </ol>
      </section>
    ),
  });
}
