import { notFound } from "next/navigation";
import { getDashboardDoc, versionHistory } from "@/entities/dashboard";
import { requireDashboardRead } from "@/shared/auth/dashboard-access";
import { dashboardShell } from "@/widgets/dashboard-shell";
import { DashboardSection } from "@/shared/ui/dashboard-primitives";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export async function VersionHistoryPage({ params }: PageProps): Promise<React.ReactElement> {
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
      <DashboardSection
        kicker="Immutable history, newest first"
        title={`${doc.name} versions`}
        actions={
          <a
            className="inline-flex h-9 items-center justify-center rounded-full border border-chalk bg-paper px-4 text-xs font-semibold text-carbon transition-all hover:border-carbon hover:bg-fog hover:scale-[1.02] active:scale-[0.98]"
            href={`/app/${org}/docs/${doc.slug}`}
          >
            Overview
          </a>
        }
      >
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
      </DashboardSection>
    ),
  });
}
