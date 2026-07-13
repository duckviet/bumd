export function StepStatusIcon({ status }: { readonly status: string }): React.ReactElement {
  switch (status) {
    case "succeeded":
      return <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" title="Succeeded" />;
    case "failed":
      return <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" title="Failed" />;
    case "running":
      return <span className="w-2.5 h-2.5 rounded-full bg-signal-orange inline-block animate-pulse" title="Running" />;
    case "skipped":
      return <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" title="Skipped" />;
    case "canceled":
      return <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" title="Canceled" />;
    default:
      return <span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block" title="Queued" />;
  }
}
