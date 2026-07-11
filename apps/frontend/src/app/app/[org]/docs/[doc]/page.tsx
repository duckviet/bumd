import { notFound } from "next/navigation";
import { getDashboardDoc, latestVersion, versionHistory } from "@/entities/dashboard";
import { canManage, dashboardShell, requireDashboardRead } from "@/app/app/[org]/docs/dashboard-helpers";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export default async function DocOverviewPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc: docSlug } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const doc = await getDashboardDoc(org, docSlug);
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
    memberships: session.memberships,
    children: (
      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h2>{doc.name}</h2>
            <p>{statusText}</p>
          </div>
          <div className="dashboard-actions">
            <a href={doc.publicUrl}>Public URL</a>
            <a href={`/${org}/${doc.slug}/changes`}>Changelog</a>
            <a href={`/app/${org}/docs/${doc.slug}/versions`}>Versions</a>
            <a href={`/app/${org}/docs/${doc.slug}/tests`}>Tests</a>
            {mayManage ? <a href={`/app/${org}/docs/${doc.slug}/settings`}>Settings</a> : null}
          </div>
        </div>
        <dl className="dashboard-facts">
          <div><dt>Slug</dt><dd>{doc.slug}</dd></div>
          <div><dt>Theme</dt><dd>{doc.theme}</dd></div>
          <div><dt>Latest version</dt><dd>{latest?.label ?? "None"}</dd></div>
          <div><dt>Total versions</dt><dd>{versions.length}</dd></div>
        </dl>
        {mayManage ? (
          <div style={{ marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "2rem" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1rem" }}>Deploy new version</h3>
            <form action={`/app/${org}/docs/${doc.slug}/versions/new`} method="post" encType="multipart/form-data" style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "400px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: 500 }}>OpenAPI / AsyncAPI Specification File</label>
                <input type="file" name="specFile" accept=".yaml,.yml,.json,.txt" required style={{ padding: "0.5rem", border: "1px solid #ddd", borderRadius: "4px" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: 500 }}>Target Branch</label>
                <input type="text" name="branch" defaultValue="main" required style={{ padding: "0.5rem", border: "1px solid #ddd", borderRadius: "4px" }} />
              </div>
              <button type="submit" style={{ padding: "0.5rem 1rem", backgroundColor: "#000", color: "#fff", border: "none", borderRadius: "4px", fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" }}>
                Upload and Deploy
              </button>
            </form>
          </div>
        ) : null}
      </section>
    ),
  });
}
