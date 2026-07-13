import { notFound } from "next/navigation";
import { dashboardVersionDetail } from "@/shared/api/dashboard-management-client";
import { dashboardShell, requireDashboardRead } from "@/app/app/[org]/docs/dashboard-helpers";
import { VersionStatusBadge } from "@/entities/dashboard";
import { StatusBadge, type StatusBadgeTone } from "@/shared/ui/status-badge";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly versionId: string;
  }>;
};

function MetadataRow({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return (
    <div className="flex flex-col justify-between gap-1 border-b border-chalk pb-2 sm:flex-row sm:items-center">
      <dt className="font-bold text-graphite">{label}</dt>
      <dd className="m-0 min-w-0 break-all text-sm">{children}</dd>
    </div>
  );
}

function diffTone(classification: string): StatusBadgeTone {
  if (classification === "breaking") return "danger";
  if (classification === "non_breaking") return "success";
  return "neutral";
}

export default async function VersionDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc: docSlug, versionId } = await params;
  const { session, membership } = await requireDashboardRead(org);

  const version = await dashboardVersionDetail(org, docSlug, versionId);
  if (version === null) {
    notFound();
  }
  const diff = version.diff;

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    children: (
      <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-6">
        <section className="flex flex-col justify-between gap-5 rounded-lg border border-chalk bg-paper p-6 sm:flex-row">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">{version.docName} / Version</p>
            <h1>v{version.sequenceNumber} Status</h1>
            <p className="text-graphite">
              Details for sequence number {version.sequenceNumber} deployed on branch {version.branchName}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <a href={`/app/${org}/docs/${docSlug}/versions`} className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog">
              Back to History
            </a>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-chalk bg-paper p-5  ">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
              <h2>Version Metadata</h2>
            </div>
            <dl className="grid gap-3">
              <MetadataRow label="Version ID"><code>{version.id}</code></MetadataRow>
              <MetadataRow label="Status"><VersionStatusBadge status={version.status} /></MetadataRow>
              <MetadataRow label="SHA-256 Hash"><code className="text-slate" title={version.sha256}>{version.sha256.slice(0, 16)}...</code></MetadataRow>
              {version.createdByTokenId ? (
                <MetadataRow label="Uploaded By Token"><code>{version.createdByTokenId}</code></MetadataRow>
              ) : null}
              {version.createdByUserId ? (
                <MetadataRow label="Uploaded By User"><code>{version.createdByUserId}</code></MetadataRow>
              ) : null}
              <MetadataRow label="Created At">{new Date(version.createdAt).toLocaleString()}</MetadataRow>
              {version.readyAt && (
                <MetadataRow label="Processed At">{new Date(version.readyAt).toLocaleString()}</MetadataRow>
              )}
            </dl>
          </section>

          <section className="rounded-lg border border-chalk bg-paper p-5  ">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
              <h2>API Diff Analysis</h2>
            </div>
            {diff ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">Classification:</span>
                  <StatusBadge label={diff.classification.replace("_", " ")} tone={diffTone(diff.classification)} />
                </div>

                <div className={`rounded-lg border p-4 text-sm ${diff.hasBreaking ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
                  <strong className="mb-1.5 block text-sm">
                    {diff.hasBreaking ? "Breaking Changes Detected!" : "Backward Compatible Update"}
                  </strong>
                  <span className="text-sm">
                    {diff.hasBreaking
                      ? "This version contains changes that break backward compatibility. Client applications might fail to process payloads correctly."
                      : "This version is backward compatible. New additions are non-breaking."}
                  </span>
                </div>

                <div className="mt-3">
                  <a
                    href={`/app/${org}/docs/${docSlug}/versions/${versionId}/diff`}
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite"
                  >
                    View Diff Analysis Details
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate p-5 text-center text-graphite">
                <p className="text-sm text-graphite">
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
