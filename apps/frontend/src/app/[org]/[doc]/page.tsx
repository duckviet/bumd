import { redirect } from "next/navigation";
import { parseOpenApiDocument } from "../../../entities/openapi/model";
import { fetchLatestReadyVersion, fetchPortalDoc } from "../../../shared/api/portal-client";
import { hasPortalAccess } from "../../../shared/auth/session";
import { EmptyState } from "../../../shared/ui/empty-state";
import { DocRenderer } from "../../../widgets/doc-renderer/doc-renderer";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export const revalidate = 30;

export default async function DocPortalPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc } = await params;
  const portalDoc = await fetchPortalDoc({ orgSlug: org, docSlug: doc });
  if (portalDoc.visibility === "private" && !(await hasPortalAccess(org))) {
    redirect("/login");
  }
  const version = await fetchLatestReadyVersion({
    orgSlug: org,
    docSlug: doc,
    branchSlug: portalDoc.defaultBranchSlug,
  });
  if (version === null) {
    return <EmptyState title="No ready version" detail="This documentation portal has no published ready version yet." />;
  }
  return (
    <DocRenderer
      branchSlug={version.branchSlug}
      docSlug={doc}
      document={parseOpenApiDocument(version.spec)}
      orgSlug={org}
      versionId={version.id}
    />
  );
}
