import { fetchChanges } from "../../../../shared/api/portal-client";
import { ChangelogList } from "../../../../widgets/changelog/changelog-list";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export const revalidate = 30;

export default async function ChangesPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc } = await params;
  const changes = await fetchChanges({ orgSlug: org, docSlug: doc });
  return <ChangelogList changes={changes} docSlug={doc} orgSlug={org} />;
}
