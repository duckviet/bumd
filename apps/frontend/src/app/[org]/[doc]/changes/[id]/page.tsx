import { fetchDiffDetail } from "../../../../../shared/api/portal-client";
import { DiffMarkdown } from "../../../../../widgets/changelog/diff-markdown";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly id: string;
  }>;
};

export const revalidate = 30;

export default async function ChangeDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc, id } = await params;
  const diff = await fetchDiffDetail({ orgSlug: org, docSlug: doc, changeId: id });
  return <DiffMarkdown docSlug={doc} markdown={diff.diffMarkdown} orgSlug={org} />;
}
