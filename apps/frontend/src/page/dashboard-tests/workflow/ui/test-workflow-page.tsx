import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type React from "react";

import { loadTestsPageData, handleTestsDataError } from "../../model/tests-page-data";
import { TestsPageClient } from "./tests-page-client";

type PageProps = {
  readonly params: Promise<{
    readonly org: string;
    readonly doc: string;
    readonly workflowId: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { org, doc, workflowId } = await params;
  const callbackPath = `/app/${encodeURIComponent(org)}/docs/${encodeURIComponent(doc)}/tests/${encodeURIComponent(workflowId)}`;
  let data: Awaited<ReturnType<typeof loadTestsPageData>>;
  try {
    data = await loadTestsPageData(org, doc);
  } catch (error: unknown) {
    handleTestsDataError(error, callbackPath);
  }
  const workflow = data.workflows.find((workflow) => workflow.id === workflowId);

  return {
    title: workflow ? `${workflow.name} · Tests` : "Tests",
  };
}

export async function TestWorkflowPage({ params }: PageProps): Promise<React.ReactElement> {
  const { org, doc, workflowId } = await params;
  const callbackPath = `/app/${encodeURIComponent(org)}/docs/${encodeURIComponent(doc)}/tests/${encodeURIComponent(workflowId)}`;
  let data: Awaited<ReturnType<typeof loadTestsPageData>>;
  try {
    data = await loadTestsPageData(org, doc);
  } catch (error: unknown) {
    handleTestsDataError(error, callbackPath);
  }

  const workflow = data.workflows.find((workflow) => workflow.id === workflowId);
  if (workflow === undefined) {
    notFound();
  }

  const initialSelectedEnvId = data.environments.find((env) => env.isDefault)?.id
    ?? data.environments[0]?.id
    ?? null;

  return (
    <TestsPageClient
      org={org}
      doc={doc}
      branch={data.branchSlug}
      initialWorkflows={data.workflows}
      initialWorkflowId={workflowId}
      operations={data.operations}
      defaultServerUrl={data.defaultServerUrl}
      initialEnvironments={data.environments}
      initialSelectedEnvId={initialSelectedEnvId}
    />
  );
}
