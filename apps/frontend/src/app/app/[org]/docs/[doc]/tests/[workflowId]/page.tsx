import { notFound } from "next/navigation";
import type React from "react";

import { loadTestsPageData } from "@/app/app/[org]/docs/[doc]/tests/tests-data";
import { TestsPageClient } from "@/app/app/[org]/docs/[doc]/tests/tests-page-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly workflowId: string;
  }>;
};

export default async function TestWorkflowCanvasPage({ params }: PageProps): Promise<React.ReactElement> {
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
    />
  );
}
