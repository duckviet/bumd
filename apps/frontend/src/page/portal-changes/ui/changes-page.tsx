import { redirect } from "next/navigation";
import { fetchChanges, fetchPortalDoc } from "@/shared/api/portal-client";
import { hasPortalAccess } from "@/shared/auth/session";
import { ChangelogList } from "@/widgets/changelog";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export async function ChangesPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc } = await params;
  const portalDoc = await fetchPortalDoc({ orgSlug: org, docSlug: doc });
  if (portalDoc.visibility === "private" && !(await hasPortalAccess(org))) {
    redirect("/login");
  }
  const changes = await fetchChanges({ orgSlug: org, docSlug: doc });
  return <ChangelogList changes={changes} docSlug={doc} orgSlug={org} />;
}
