import { notFound } from "next/navigation";
import { getDashboardDoc, versionHistory } from "@/entities/dashboard";
import { dashboardShell, requireDashboardRead } from "@/app/app/[org]/docs/dashboard-helpers";

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
      <section className="rounded-lg border border-chalk bg-paper p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
          <div>
            <h2>{doc.name} versions</h2>
            <p>Immutable history, newest first</p>
          </div>
          <a href={`/app/${org}/docs/${doc.slug}`}>Overview</a>
        </div>
        <ol className="grid list-none gap-3 p-0">
          {versions.map((version) => (
            <li className="flex flex-col justify-between gap-4 rounded-lg border border-chalk bg-paper p-4 sm:flex-row sm:items-center" key={version.id}>
              <div>
                <h3>
                  <a className="font-extrabold text-carbon" href={`/app/${org}/docs/${docSlug}/versions/${version.id}`}>
                    {version.label}
                  </a>
                </h3>
                <p className="mt-1 text-sm text-graphite">
                  {version.status} · sequence {version.sequenceNumber} · sha256 {version.sha256.slice(0, 12)}...
                </p>
              </div>
              <time className="text-sm text-slate">{new Date(version.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      </section>
    ),
  });
}
