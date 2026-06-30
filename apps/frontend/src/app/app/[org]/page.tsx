import { MembershipRole } from "../../../shared/auth/auth-store";
import { requireOrgRole } from "../../../shared/auth/session";
import { dashboardShell } from "./docs/dashboard-helpers";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
  }>;
};

export default async function OrganizationDashboardPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org } = await params;
  const { session, membership } = await requireOrgRole(org, [
    MembershipRole.Owner,
    MembershipRole.Admin,
    MembershipRole.Member,
    MembershipRole.Guest,
  ]);

  return dashboardShell({
    organizationSlug: org,
    email: session.email,
    role: membership.role,
    children: (
      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <h2>Organization Hub</h2>
            <p>Welcome to {org}'s dashboard workspace</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
          {/* Profile Card */}
          <div className="bg-fog p-6 rounded-lg border border-chalk">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate mb-2">My Profile</h3>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-carbon font-polysans">{session.name || session.email}</p>
              <p className="text-sm text-graphite">{session.email}</p>
            </div>
            <div className="mt-4 pt-4 border-t border-chalk/60 flex items-center justify-between">
              <span className="text-xs text-graphite font-medium">Access Level</span>
              <span className="text-xs font-bold font-mono uppercase bg-white px-2.5 py-0.5 rounded-full border border-chalk text-signal-orange">
                {membership.role}
              </span>
            </div>
          </div>

          {/* Quick Access Navigation */}
          <div className="bg-fog p-6 rounded-lg border border-chalk flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate mb-2">Quick Navigation</h3>
              <p className="text-sm text-graphite leading-relaxed">
                Manage your API docs, view version histories, run test queries, and track breaking changes.
              </p>
            </div>
            <div className="mt-6">
              <a 
                href={`/app/${org}/docs`} 
                className="button-link w-full text-center inline-block"
              >
                Go to Docs
              </a>
            </div>
          </div>
        </div>
      </section>
    ),
  });
}


