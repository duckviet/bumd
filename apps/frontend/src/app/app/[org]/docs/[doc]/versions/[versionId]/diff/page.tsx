import { notFound } from "next/navigation";
import { getDb } from "../../../../../../../../shared/db";
import { dashboardShell, requireDashboardRead } from "../../../../dashboard-helpers";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly versionId: string;
  }>;
};

type DbChange = {
  readonly type: string;
  readonly path: string;
  readonly message: string;
  readonly level: "breaking" | "non-breaking" | string;
};

export default async function DiffDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc: docSlug, versionId } = await params;
  const { session, membership } = await requireDashboardRead(org);

  const db = getDb();

  // Fetch Version details
  const versionRes = await db.query(
    `SELECT v.*, d.name AS "docName"
     FROM "Version" v
     INNER JOIN "Doc" d ON d.id = v."docId"
     INNER JOIN "Organization" o ON o.id = d."organizationId"
     WHERE o.slug = $1 AND d.slug = $2 AND v.id = $3`,
    [org, docSlug, versionId]
  );

  if (versionRes.rows.length === 0) {
    notFound();
  }

  const version = versionRes.rows[0];

  // Fetch Diff details
  const diffRes = await db.query(
    `SELECT *
     FROM "Diff"
     WHERE "headVersionId" = $1`,
    [versionId]
  );

  if (diffRes.rows.length === 0) {
    notFound();
  }

  const diff = diffRes.rows[0];

  // Safely extract changes
  let parsedChanges: readonly DbChange[] = [];
  try {
    const rawChanges = typeof diff.changes === "string" ? JSON.parse(diff.changes) : diff.changes;
    if (Array.isArray(rawChanges)) {
      parsedChanges = rawChanges as readonly DbChange[];
    }
  } catch {
    // Fallback
  }

  const breakingChanges = parsedChanges.filter(c => c.level === "breaking" || (c as any).breaking === true);
  const nonBreakingChanges = parsedChanges.filter(c => c.level !== "breaking" && (c as any).breaking !== true);

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    children: (
      <div className="dashboard-workspace">
        <section className="dashboard-hero dashboard-hero-compact">
          <div>
            <p className="dashboard-kicker">{version.docName} / Version v{version.sequenceNumber} / Diff</p>
            <h1>Diff Analysis Report</h1>
            <p className="dashboard-lede">
              Showing detailed OpenAPI changes detected against the previous baseline version.
            </p>
          </div>
          <div className="dashboard-hero-actions">
            <a href={`/app/${org}/docs/${docSlug}/versions/${versionId}`} className="dashboard-secondary-action">
              Back to Version Details
            </a>
          </div>
        </section>

        <section className="dashboard-panel" style={{ marginBottom: "24px" }}>
          <h2>Summary</h2>
          <div className="dashboard-facts" style={{ display: "flex", gap: "24px", marginTop: "12px" }}>
            <div style={{ flex: 1, padding: "16px", background: "#f5f5f5", borderRadius: "8px", border: "1px solid #e8e8e8" }}>
              <span style={{ fontSize: "12px", color: "#666", fontWeight: "700", textTransform: "uppercase" }}>Classification</span>
              <strong style={{ display: "block", fontSize: "20px", marginTop: "4px", color: diff.hasBreaking ? "#dc2626" : "#137333" }}>
                {diff.classification.replace("_", " ").toUpperCase()}
              </strong>
            </div>
            <div style={{ flex: 1, padding: "16px", background: "#fdf2f2", borderRadius: "8px", border: "1px solid #fde8e8" }}>
              <span style={{ fontSize: "12px", color: "#e02424", fontWeight: "700", textTransform: "uppercase" }}>Breaking Changes</span>
              <strong style={{ display: "block", fontSize: "24px", marginTop: "4px", color: "#e02424" }}>
                {breakingChanges.length}
              </strong>
            </div>
            <div style={{ flex: 1, padding: "16px", background: "#f3fbf3", borderRadius: "8px", border: "1px solid #def7ec" }}>
              <span style={{ fontSize: "12px", color: "#03543f", fontWeight: "700", textTransform: "uppercase" }}>Non-breaking Changes</span>
              <strong style={{ display: "block", fontSize: "24px", marginTop: "4px", color: "#03543f" }}>
                {nonBreakingChanges.length}
              </strong>
            </div>
          </div>
        </section>

        {breakingChanges.length > 0 && (
          <section className="dashboard-panel" style={{ marginBottom: "24px", borderColor: "#fecaca" }}>
            <div className="dashboard-section-header">
              <h2 style={{ color: "#dc2626" }}>Breaking Changes ({breakingChanges.length})</h2>
              <p>These changes require immediate attention as they break contract compatibility.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
              {breakingChanges.map((change, index) => (
                <div key={index} style={{ padding: "12px 16px", background: "#fff5f5", borderLeft: "4px solid #dc2626", borderRadius: "0 8px 8px 0", borderTop: "1px solid #fecaca", borderRight: "1px solid #fecaca", borderBottom: "1px solid #fecaca" }}>
                  <div style={{ display: "flex", gap: "8px", fontSize: "12px", fontWeight: "700", color: "#b91c1c", marginBottom: "4px", textTransform: "uppercase" }}>
                    <span>{change.type || "Modified"}</span>
                    <span>•</span>
                    <span style={{ fontFamily: "monospace" }}>{change.path}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "14px", color: "#4b5563" }}>{change.message}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="dashboard-panel">
          <div className="dashboard-section-header">
            <h2>All Changes ({parsedChanges.length})</h2>
            <p>Complete list of modifications between spec versions.</p>
          </div>
          {parsedChanges.length === 0 ? (
            <div style={{ marginTop: "16px" }}>
              <pre
                style={{
                  background: "#f9f9f9",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e8e8e8",
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  fontSize: "14px",
                  color: "#202020",
                }}
              >
                {diff.diffMarkdown || "No detailed change list found."}
              </pre>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
              {parsedChanges.map((change, index) => {
                const isBreaking = change.level === "breaking" || (change as any).breaking === true;
                return (
                  <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px", border: "1px solid #e8e8e8", borderRadius: "8px", background: "#ffffff" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span
                          className="dashboard-badge"
                          style={{
                            fontSize: "10px",
                            padding: "0 6px",
                            minHeight: "18px",
                            background: isBreaking ? "#fce8e6" : "#e6f4ea",
                            color: isBreaking ? "#c5221f" : "#137333",
                            borderColor: isBreaking ? "#fad2cf" : "#ceead6",
                          }}
                        >
                          {isBreaking ? "breaking" : "compatible"}
                        </span>
                        <code style={{ fontSize: "13px", color: "#4d4d4d", fontWeight: "700" }}>{change.path}</code>
                      </div>
                      <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#202020" }}>{change.message}</p>
                    </div>
                    <span style={{ fontSize: "12px", color: "#828282", textTransform: "uppercase", fontWeight: "700" }}>
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
