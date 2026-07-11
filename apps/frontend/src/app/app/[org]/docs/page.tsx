import { latestVersion, listDashboardDocs, type DashboardDoc } from "@/entities/dashboard";
import { canManage, dashboardShell, requireDashboardRead } from "@/app/app/[org]/docs/dashboard-helpers";
import { CreateDocModal } from "@/app/app/[org]/docs/create-doc-modal";
import { VersionStatusBadge } from "@/entities/dashboard";

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
      <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-6">
        <section className="flex flex-col justify-between gap-5 rounded-lg border border-chalk bg-paper p-6 sm:flex-row">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">Portals</p>
            <h1>Docs dashboard</h1>
            <p className="text-graphite">Open a portal, inspect its latest version, or jump straight into deploy and settings from this list.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {mayManage ? <CreateDocModal org={org} /> : null}
            <a className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite border-carbon bg-transparent text-carbon hover:bg-chalk" href={`/app/${org}`}>
              Overview
            </a>
          </div>
        </section>

        <section className="rounded-lg border border-chalk bg-paper p-5 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">{docs.length} portal{docs.length === 1 ? "" : "s"}</p>
              <h2>Manage documentation</h2>
            </div>
          </div>
          {docs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate p-6 text-graphite">
              <h3>No docs yet</h3>
              <p>Create a portal to start tracking immutable versions, diffs, and public render output.</p>
              {mayManage ? <CreateDocModal org={org} /> : null}
            </div>
          ) : (
            <div className="grid gap-3 grid gap-3">
              {docs.map((doc) => {
                const latest = latestVersion(doc);
                return (
                <article className="grid grid-cols-1 gap-4 rounded-lg border border-chalk bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_auto]" key={doc.slug}>
                  <a href={`/app/${org}/docs/${doc.slug}`}>
                    <strong>{doc.name}</strong>
                    <small className="ml-4 text-xs text-slate">{doc.visibility} / {doc.theme}</small>
                  </a>
                  {latest === null ? <VersionStatusBadge /> : <VersionStatusBadge label={latest.label} status={latest.status} />}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <a href={`/app/${org}/docs/${doc.slug}/versions`}>Versions</a>
                    <a href={`/${org}/${doc.slug}/changes`}>Changelog</a>
                    {mayManage ? <a href={`/app/${org}/docs/${doc.slug}/settings`}>Settings</a> : null}
                    <a href={doc.publicUrl}>Public</a>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    ),
  });
}
