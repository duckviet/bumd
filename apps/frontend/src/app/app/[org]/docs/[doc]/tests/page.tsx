import type React from "react";

import { TestsListClient } from "@/app/app/[org]/docs/[doc]/tests/tests-list-client";
import { loadTestsPageData } from "@/app/app/[org]/docs/[doc]/tests/tests-data";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export default async function TestsOverviewPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc } = await params;
  const data = await loadTestsPageData(org, doc);

  console.log(org, doc, data)
  return <TestsListClient org={org} doc={doc} branch={data.branchSlug} initialWorkflows={data.workflows} />;
}
