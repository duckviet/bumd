"use client";

import { usePathname } from "next/navigation";

import { RouteNotFoundFallback } from "@/shared/ui/route-fallbacks";

function TestsOverviewLink(): React.ReactElement {
  const pathname = usePathname();
  const parts = pathname.split("/");
  const workflowId = parts.at(-1);
  const href = workflowId !== undefined && workflowId !== ""
    ? pathname.slice(0, pathname.lastIndexOf(`/${workflowId}`))
    : "/";

  return (
    <RouteNotFoundFallback
      detail="The workflow you are looking for does not exist or may have been moved."
      href={href}
      linkLabel="Back to tests overview"
      title="Workflow not found"
    />
  );
}

export default function TestWorkflowNotFound(): React.ReactElement {
  return <TestsOverviewLink />;
}
