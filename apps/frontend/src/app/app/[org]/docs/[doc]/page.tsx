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
      <section className="rounded-lg border border-chalk bg-paper p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
          <div>
            <h2>{doc.name}</h2>
            <p>{statusText}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href={doc.publicUrl}>Public URL</a>
            <a href={`/${org}/${doc.slug}/changes`}>Changelog</a>
            <a href={`/app/${org}/docs/${doc.slug}/versions`}>Versions</a>
            <a href={`/app/${org}/docs/${doc.slug}/tests`}>Tests</a>
            {mayManage ? <a href={`/app/${org}/docs/${doc.slug}/settings`}>Settings</a> : null}
          </div>
        </div>
        <dl className="mt-6 flex flex-wrap gap-6">
          <div><dt>Slug</dt><dd>{doc.slug}</dd></div>
          <div><dt>Theme</dt><dd>{doc.theme}</dd></div>
          <div><dt>Latest version</dt><dd>{latest?.label ?? "None"}</dd></div>
          <div><dt>Total versions</dt><dd>{versions.length}</dd></div>
        </dl>
        {mayManage ? (
          <div className="mt-8 border-t border-chalk pt-8">
            <h3 className="mb-4 text-xl font-semibold">Deploy new version</h3>
            <form className="flex max-w-md flex-col gap-4" action={`/app/${org}/docs/${doc.slug}/versions/new`} method="post" encType="multipart/form-data">
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>OpenAPI / AsyncAPI Specification File</span>
                <input className="rounded-lg border border-chalk bg-paper p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-fog file:px-3 file:py-1.5 file:font-semibold" type="file" name="specFile" accept=".yaml,.yml,.json,.txt" required />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>Target Branch</span>
                <input className="rounded-lg border border-chalk bg-paper px-3 py-2 outline-none focus:border-signal-orange" type="text" name="branch" defaultValue="main" required />
              </label>
              <button className="inline-flex min-h-10 self-start rounded-full bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" type="submit">
                Upload and Deploy
              </button>
            </form>
          </div>
        ) : null}
      </section>
    ),
  });
}
