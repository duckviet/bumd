import { requireUserSession } from "../../shared/auth/session";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const session = await requireUserSession("/app");
  return (
    <main>
      <h1>Dashboard</h1>
      <p>{session.email}</p>
      <nav>
        {session.memberships.map((membership) => (
          <a href={`/app/${membership.organizationSlug}`} key={membership.organizationSlug}>
            {membership.organizationSlug}
          </a>
        ))}
      </nav>
      <form action="/logout" method="post">
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}

