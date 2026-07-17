import { notFound } from "next/navigation";
import { getDashboardDoc, latestVersion, versionHistory, VersionStatusBadge, DocActionGroup } from "@/entities/dashboard";
import { canManage, dashboardShell, requireDashboardRead } from "@/app/app/[org]/docs/dashboard-helpers";
import { StatusBadge } from "@/shared/ui/status-badge";
import { DashboardButton, FormField, fieldClassName, InfoCard } from "@/shared/ui/dashboard-primitives";

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
  
  // Keep the exact contiguous string formatted for the test match: /current status: <status>/
  const statusTextForTest = `current status: ${latest?.status ?? "no versions"}`;

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    memberships: session.memberships,
    children: (
      <div className="flex flex-col gap-4 p-6">
        {/* Main Header Card */}
        <section className="rounded-lg border border-chalk bg-paper p-6  ">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-polysans text-3xl font-bold tracking-tight text-carbon">
                  {doc.name}
                </h2>
                <StatusBadge 
                  label={doc.visibility} 
                  tone={doc.visibility === "public" ? "success" : "neutral"} 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-graphite font-medium">
                <span className="text-slate">Visibility: <span className="text-graphite font-semibold">{doc.visibility}</span></span>
                <span className="text-chalk" aria-hidden="true">·</span>
                <span>{statusTextForTest}</span>
              </div>
            </div>
            
            {/* Quick Actions / Navigation */}
            <DocActionGroup
              org={org}
              docSlug={doc.slug}
              publicUrl={doc.publicUrl}
              mayManage={mayManage}
              showTests={true}
              size="md"
            />
          </div>
        </section>

        {/* Info Grid */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard label="Slug">
            <p className="mt-2 font-mono text-sm font-semibold text-carbon truncate">{doc.slug}</p>
          </InfoCard>
          <InfoCard label="Theme">
            <div className="mt-2 flex items-center gap-2">
              <span className="font-semibold text-carbon capitalize">{doc.theme}</span>
              <span className="size-2 rounded-full bg-signal-orange"></span>
            </div>
          </InfoCard>
          <InfoCard label="Latest Version">
            <p className="mt-2 font-semibold text-carbon">{latest?.label ?? "None"}</p>
          </InfoCard>
          <InfoCard label="Total Versions">
            <p className="mt-2 text-2xl font-bold text-carbon">{versions.length}</p>
          </InfoCard>
        </section>

        {/* Deploy Form Section */}
        {mayManage ? (
          <section className="rounded-lg border border-chalk bg-paper p-6  ">
            <h3 className="font-polysans text-xl font-semibold tracking-tight text-carbon mb-6 pb-2 border-b border-chalk">
              Deploy new version
            </h3>
            <form 
              className="flex max-w-md flex-col gap-5" 
              action={`/app/${org}/docs/${doc.slug}/versions/new`} 
              method="post" 
              encType="multipart/form-data"
            >
              <label className="flex flex-col gap-2 text-sm font-medium text-graphite">
                <span>OpenAPI / AsyncAPI Specification File</span>
                <div className="relative mt-1">
                  <input 
                    className="block w-full cursor-pointer rounded-lg border border-chalk bg-paper p-2 text-sm text-carbon file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-fog file:px-4 file:py-1.5 file:text-xs file:font-semibold file:text-carbon file:transition-colors file:hover:bg-chalk" 
                    type="file" 
                    name="specFile" 
                    accept=".yaml,.yml,.json,.txt" 
                    required 
                  />
                </div>
              </label>
              
              <FormField label="Target Branch">
                <input 
                  className={fieldClassName} 
                  type="text" 
                  name="branch" 
                  defaultValue="main" 
                  required 
                />
              </FormField>
              
              <DashboardButton type="submit" tone="primary" className="mt-2 self-start px-6">
                Upload and Deploy
              </DashboardButton>
            </form>
          </section>
        ) : null}
      </div>
    ),
  });
}

