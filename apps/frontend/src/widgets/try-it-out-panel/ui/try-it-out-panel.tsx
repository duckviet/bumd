"use client";

import { TryItOutPanel as TryItOutPanelFeature } from "@/features/try-it-out";
import type { ApiOperation } from "@/entities/openapi";

export function TryItOutPanel({
  orgSlug,
  docSlug,
  branchSlug,
  versionId,
  serverUrl,
  operation,
}: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
  readonly serverUrl: string;
  readonly operation: ApiOperation | null;
}): React.ReactElement {
  return (
    <TryItOutPanelFeature
      orgSlug={orgSlug}
      docSlug={docSlug}
      branchSlug={branchSlug}
      versionId={versionId}
      serverUrl={serverUrl}
      operation={operation}
    />
  );
}
