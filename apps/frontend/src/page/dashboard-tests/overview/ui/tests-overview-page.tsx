import type React from "react";

import { loadTestsPageData } from "../../model/tests-page-data";
import { TestsListClient } from "./tests-list-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
  }>;
};

export async function TestsOverviewPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc } = await params;
  const data = await loadTestsPageData(org, doc);

  return <TestsListClient org={org} doc={doc} branch={data.branchSlug} initialWorkflows={data.workflows} />;
}
