import { latestVersion, listDashboardDocs, DocActionGroup } from "@/entities/dashboard";
import { canManage, dashboardShell, requireDashboardRead } from "@/app/app/[org]/docs/dashboard-helpers";
import { CreateDocModal } from "@/app/app/[org]/docs/create-doc-modal";
import { VersionStatusBadge } from "@/entities/dashboard";
import { DashboardPageHeader, DashboardSection } from "@/shared/ui/dashboard-primitives";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export default async function DocsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireDashboardRead(org);
  const docs = await listDashboardDocs(org);
  const mayManage = canManage(membership.role);

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    tab: "portals",
    children: (
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <DashboardPageHeader
          kicker="Portals"
          title="Docs dashboard"
          description="Open a portal, inspect its latest version, or jump into deploy and settings from this list."
          actions={
            <>
              {mayManage ? <CreateDocModal org={org} /> : null}
              <a
                className="inline-flex h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon transition-colors hover:border-carbon hover:bg-fog"
                href={`/app/${org}`}
              >
                Overview
              </a>
            </>
          }
        />

        <DashboardSection
          kicker={`${docs.length} portal${docs.length === 1 ? "" : "s"}`}
          title="Manage documentation"
        >
          {docs.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-chalk p-8">
              <h3 className="text-lg font-semibold text-carbon">No docs yet</h3>
              <p className="max-w-md text-sm text-graphite">
                Create a portal to start tracking immutable versions, diffs, and public render output.
              </p>
              {mayManage ? <CreateDocModal org={org} triggerLabel="Create first doc" /> : null}
            </div>
          ) : (
            <div className="grid gap-3">
              {docs.map((doc) => {
                const latest = latestVersion(doc);
                return (
                  <article
                    className="grid grid-cols-1 gap-4 rounded-lg border border-chalk bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                    key={doc.slug}
                  >
                    <a className="min-w-0" href={`/app/${org}/docs/${doc.slug}`}>
                      <strong className="text-base font-semibold text-carbon">{doc.name}</strong>
                      <small className="ml-3 text-xs text-slate">
                        {doc.visibility} / {doc.theme}
                      </small>
                    </a>
                    {latest === null ? (
                      <VersionStatusBadge />
                    ) : (
                      <VersionStatusBadge label={latest.label} status={latest.status} />
                    )}
                    <div className="sm:col-span-2">
                      <DocActionGroup
                        org={org}
                        docSlug={doc.slug}
                        publicUrl={doc.publicUrl}
                        mayManage={mayManage}
                        size="sm"
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </DashboardSection>
      </div>
    ),
  });
}
