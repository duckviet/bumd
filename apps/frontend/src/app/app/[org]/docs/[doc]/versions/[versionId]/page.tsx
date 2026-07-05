import { notFound } from "next/navigation";
import { getDb } from "../../../../../../../shared/db";
import { dashboardShell, requireDashboardRead } from "../../../dashboard-helpers";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly versionId: string;
  }>;
};

export default async function VersionDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc: docSlug, versionId } = await params;
  const { session, membership } = await requireDashboardRead(org);

  const db = getDb();

  // Fetch Version details
  const versionRes = await db.query(
    `SELECT v.*, b.name AS "branchName", d.name AS "docName"
     FROM "Version" v
     INNER JOIN "Branch" b ON b.id = v."branchId"
     INNER JOIN "Doc" d ON d.id = v."docId"
     INNER JOIN "Organization" o ON o.id = d."organizationId"
     WHERE o.slug = $1 AND d.slug = $2 AND v.id = $3`,
    [org, docSlug, versionId]
  );

  if (versionRes.rows.length === 0) {
    notFound();
  }

  const version = versionRes.rows[0];

  // Fetch optional associated Diff
  const diffRes = await db.query(
    `SELECT id, classification::text AS classification, "hasBreaking"
     FROM "Diff"
     WHERE "headVersionId" = $1`,
    [versionId]
  );

  const diff = diffRes.rows[0] || null;

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    children: (
      <div className="dashboard-workspace">
        <section className="dashboard-hero dashboard-hero-compact">
          <div>
            <p className="dashboard-kicker">{version.docName} / Version</p>
            <h1>v{version.sequenceNumber} Status</h1>
            <p className="dashboard-lede">
              Details for sequence number {version.sequenceNumber} deployed on branch {version.branchName}.
            </p>
          </div>
          <div className="dashboard-hero-actions">
            <a href={`/app/${org}/docs/${docSlug}/versions`} className="dashboard-secondary-action">
              Back to History
            </a>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <section className="dashboard-panel">
            <div className="dashboard-section-header">
              <h2>Version Metadata</h2>
            </div>
            <dl className="dashboard-facts" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: 0, margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e8e8e8", paddingBottom: "8px" }}>
                <dt style={{ fontWeight: "700", color: "#4d4d4d" }}>Version ID</dt>
                <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "14px" }}>{version.id}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e8e8e8", paddingBottom: "8px" }}>
                <dt style={{ fontWeight: "700", color: "#4d4d4d" }}>Status</dt>
                <dd style={{ margin: 0 }}>
                  <span
                    className="dashboard-badge"
                    style={{
                      textTransform: "uppercase",
                      background:
                        version.status === "ready"
                          ? "#e6f4ea"
                          : version.status === "failed"
                          ? "#fce8e6"
                          : "#fff3ed",
                      color:
                        version.status === "ready"
                          ? "#137333"
                          : version.status === "failed"
                          ? "#c5221f"
                          : "#9c3d13",
                      borderColor:
                        version.status === "ready"
                          ? "#ceead6"
                          : version.status === "failed"
                          ? "#fad2cf"
                          : "#ffd5c2",
                    }}
                  >
                    {version.status}
                  </span>
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e8e8e8", paddingBottom: "8px" }}>
                <dt style={{ fontWeight: "700", color: "#4d4d4d" }}>SHA-256 Hash</dt>
                <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "13px", color: "#666" }} title={version.sha256}>
                  {version.sha256.slice(0, 16)}...
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e8e8e8", paddingBottom: "8px" }}>
                <dt style={{ fontWeight: "700", color: "#4d4d4d" }}>Uploaded By Token</dt>
                <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "14px" }}>{version.createdByTokenId}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e8e8e8", paddingBottom: "8px" }}>
                <dt style={{ fontWeight: "700", color: "#4d4d4d" }}>Created At</dt>
                <dd style={{ margin: 0 }}>{new Date(version.createdAt).toLocaleString()}</dd>
              </div>
              {version.readyAt && (
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e8e8e8", paddingBottom: "8px" }}>
                  <dt style={{ fontWeight: "700", color: "#4d4d4d" }}>Processed At</dt>
                  <dd style={{ margin: 0 }}>{new Date(version.readyAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="dashboard-panel">
            <div className="dashboard-section-header">
              <h2>API Diff Analysis</h2>
            </div>
            {diff ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "15px", fontWeight: "700" }}>Classification:</span>
                  <span
                    className="dashboard-badge"
                    style={{
                      textTransform: "uppercase",
                      background:
                        diff.classification === "breaking"
                          ? "#fce8e6"
                          : diff.classification === "non_breaking"
                          ? "#e6f4ea"
                          : "#f1f3f4",
                      color:
                        diff.classification === "breaking"
                          ? "#c5221f"
                          : diff.classification === "non_breaking"
                          ? "#137333"
                          : "#3c4043",
                      borderColor:
                        diff.classification === "breaking"
                          ? "#fad2cf"
                          : diff.classification === "non_breaking"
                          ? "#ceead6"
                          : "#dadce0",
                    }}
                  >
                    {diff.classification.replace("_", " ")}
                  </span>
                </div>

                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    background: diff.hasBreaking ? "#fff0f0" : "#f4fdf4",
                    border: `1px solid ${diff.hasBreaking ? "#ffd1d1" : "#d1ffd1"}`,
                    color: diff.hasBreaking ? "#8e1b1b" : "#1b8e1b",
                  }}
                >
                  <strong style={{ fontSize: "15px", display: "block", marginBottom: "6px" }}>
                    {diff.hasBreaking ? "Breaking Changes Detected!" : "Backward Compatible Update"}
                  </strong>
                  <span style={{ fontSize: "13px" }}>
                    {diff.hasBreaking
                      ? "This version contains changes that break backward compatibility. Client applications might fail to process payloads correctly."
                      : "This version is backward compatible. New additions are non-breaking."}
                  </span>
                </div>

                <div style={{ marginTop: "12px" }}>
                  <a
                    href={`/app/${org}/docs/${docSlug}/versions/${versionId}/diff`}
                    className="dashboard-button"
                    style={{ textDecoration: "none" }}
                  >
                    View Diff Analysis Details
                  </a>
                </div>
              </div>
            ) : (
              <div className="dashboard-empty" style={{ padding: "20px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>
                  No diff analysis is available for this version. This could be the first version, or it failed validation.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    ),
  });
}
