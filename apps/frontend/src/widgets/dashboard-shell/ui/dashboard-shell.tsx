import { MembershipRole, type Membership } from "@/shared/auth/rbac";
import { DashboardNavLink } from "@/shared/ui/dashboard-primitives";
import { OrgSwitcher } from "./org-switcher";

type DashboardTab = "overview" | "portals" | "members" | "api-tokens" | "webhooks";

const tabs: readonly { readonly id: DashboardTab; readonly label: string; readonly href: (org: string) => string }[] = [
  { id: "overview", label: "Overview", href: (org) => `/app/${org}` },
  { id: "portals", label: "Portals", href: (org) => `/app/${org}/docs` },
  { id: "members", label: "Members & Invites", href: (org) => `/app/${org}/members` },
  { id: "api-tokens", label: "API Tokens", href: (org) => `/app/${org}/api-tokens` },
  { id: "webhooks", label: "Webhooks", href: (org) => `/app/${org}/webhooks` },
];

export function dashboardShell(input: {
  readonly organizationSlug: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly memberships?: readonly Membership[];
  readonly tab?: DashboardTab;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const activeTab = input.tab ?? "overview";

  return (
    <main className="min-h-[100dvh] bg-mist text-carbon">
      <header className="border-b border-chalk bg-paper">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <a className="flex shrink-0 items-center gap-1.5 hover:opacity-90" href="/app">
                <span className="font-polysans text-2xl font-bold tracking-tight text-carbon">
                  ventriloc<span className="text-signal-orange">.</span>
                </span>
              </a>
              <div className="hidden h-6 w-px bg-chalk sm:block" aria-hidden="true" />
              <div className="min-w-0">
                {input.memberships && input.memberships.length > 0 ? (
                  <OrgSwitcher currentOrg={input.organizationSlug} memberships={input.memberships} />
                ) : (
                  <p className="text-xs font-bold uppercase tracking-wider text-sienna-bronze">{input.organizationSlug}</p>
                )}
                <p className="mt-0.5 truncate text-sm text-graphite">Documentation dashboard</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-graphite">
                <span className="max-w-[14rem] truncate">{input.email}</span>
                <span className="inline-flex h-7 items-center rounded-full border border-chalk bg-fog px-2.5 text-xs font-semibold uppercase tracking-wide text-graphite">
                  {input.role}
                </span>
              </div>
              <form action="/logout" method="post" className="m-0">
                <button
                  className="inline-flex h-9 items-center justify-center rounded-full border border-chalk bg-paper px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon hover:bg-fog"
                  type="submit"
                >
                  Log out
                </button>
              </form>
            </div>
          </div>

          <nav
            aria-label="Dashboard"
            className="flex gap-1 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((tab) => (
              <DashboardNavLink
                active={activeTab === tab.id}
                href={tab.href(input.organizationSlug)}
                key={tab.id}
              >
                {tab.label}
              </DashboardNavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl">{input.children}</div>
    </main>
  );
}
