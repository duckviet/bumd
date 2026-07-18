import { RouteNotFoundFallback } from "@/shared/ui/route-fallbacks";

export default function RootNotFound(): React.ReactElement {
  return (
    <RouteNotFoundFallback
      detail="The page you are looking for does not exist or may have been moved."
      href="/app"
      linkLabel="Go to dashboard"
      title="Page not found"
    />
  );
}
