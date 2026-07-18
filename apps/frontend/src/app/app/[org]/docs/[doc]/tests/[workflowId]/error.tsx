"use client";

import { RouteErrorFallback } from "@/shared/ui/route-fallbacks";

export default function TestWorkflowError({
  error,
  reset,
}: {
  readonly error: Error;
  readonly reset: () => void;
}): React.ReactElement {
  void error;

  return (
    <RouteErrorFallback
      detail="The test workflow could not be loaded. If your session expired, sign in again."
      resetAction={reset}
      showSignIn
      title="Something went wrong"
    />
  );
}
