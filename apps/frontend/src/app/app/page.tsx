import { requireUserSession } from "@/shared/auth/session";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const session = await requireUserSession("/app");
  return (
    <main className="dashboard-shell">
      <div className="dashboard-panel max-w-lg mx-auto">
        <div className="mb-6">
          <span className="text-xs uppercase tracking-wider font-semibold text-signal-orange">ventriloc</span>
          <h1 className="text-4xl mt-1">Dashboard</h1>
          <p className="text-sm text-slate mt-1">{session.email}</p>
        </div>
        
        <h2 className="text-xl font-semibold mb-3">Your Organizations</h2>
        <nav className="flex flex-col gap-2 mb-8">
          {session.memberships.map((membership) => (
            <a 
              href={`/app/${membership.organizationSlug}`} 
              key={membership.organizationSlug}
              className="flex items-center justify-between p-4 bg-fog hover:bg-chalk border border-chalk rounded-lg transition-all font-medium text-carbon"
            >
              <span>{membership.organizationSlug}</span>
              <span className="text-xs text-slate uppercase bg-white px-2.5 py-1 rounded-full border border-chalk font-semibold">{membership.role}</span>
            </a>
          ))}
        </nav>
        
        <form action="/logout" method="post" className="border-t border-chalk pt-6">
          <button type="submit" className="button-secondary w-full">Log out</button>
        </form>
      </div>
    </main>
  );
}

