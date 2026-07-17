import { redirect } from "next/navigation";
import { fetchDiffDetail, fetchPortalDoc } from "@/shared/api/portal-client";
import { hasPortalAccess } from "@/shared/auth/session";
import { DiffMarkdown } from "@/widgets/changelog";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly id: string;
  }>;
};

export async function ChangeDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc, id } = await params;
  const portalDoc = await fetchPortalDoc({ orgSlug: org, docSlug: doc });
  if (portalDoc.visibility === "private" && !(await hasPortalAccess(org))) {
    redirect("/login");
  }
  const diff = await fetchDiffDetail({ orgSlug: org, docSlug: doc, changeId: id });
  return <DiffMarkdown docSlug={doc} markdown={diff.diffMarkdown} orgSlug={org} />;
}
