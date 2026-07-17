import { notFound } from "next/navigation";
import type React from "react";

import { loadTestsPageData } from "../../model/tests-page-data";
import { TestsPageClient } from "./tests-page-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly workflowId: string;
  }>;
};

export async function TestWorkflowPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc, workflowId } = await params;
  const data = await loadTestsPageData(org, doc);

  if (!data.workflows.some((workflow) => workflow.id === workflowId)) {
    notFound();
  }

  return (
    <TestsPageClient
      org={org}
      doc={doc}
      branch={data.branchSlug}
      initialWorkflows={data.workflows}
      initialWorkflowId={workflowId}
      operations={data.operations}
      defaultServerUrl={data.defaultServerUrl}
    />
  );
}
