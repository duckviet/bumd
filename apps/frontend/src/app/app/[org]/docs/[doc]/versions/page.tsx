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
  const doc = await getDashboardDoc(org, docSlug);
  if (doc === null) {
    notFound();
  }
  const versions = versionHistory(doc);
  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    children: (
      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h2>{doc.name} versions</h2>
            <p>Immutable history, newest first</p>
          </div>
          <a href={`/app/${org}/docs/${doc.slug}`}>Overview</a>
        </div>
        <ol className="dashboard-list" style={{ display: "grid", gap: "12px", listStyle: "none", padding: 0 }}>
          {versions.map((version) => (
            <li className="dashboard-doc-row" key={version.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  <a href={`/app/${org}/docs/${docSlug}/versions/${version.id}`} style={{ color: "#202020", textDecoration: "none", fontWeight: "800" }}>
                    {version.label}
                  </a>
                </h3>
                <p style={{ margin: "4px 0 0", color: "#4d4d4d", fontSize: "14px" }}>
                  {version.status} · sequence {version.sequenceNumber} · sha256 {version.sha256.slice(0, 12)}...
                </p>
              </div>
              <time style={{ fontSize: "13px", color: "#828282" }}>{new Date(version.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      </section>
    ),
  });
}
