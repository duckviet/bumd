export default function TestWorkflowLoading(): React.ReactElement {
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-paper">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-chalk bg-paper px-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-32 animate-pulse rounded bg-fog" />
          <div className="h-5 w-px bg-chalk" />
          <div className="h-5 w-28 animate-pulse rounded bg-fog" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-40 animate-pulse rounded-full bg-fog" />
          <div className="h-9 w-24 animate-pulse rounded-full bg-fog" />
          <div className="h-9 w-24 animate-pulse rounded-full bg-fog" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col border-r border-chalk bg-mist">
          <div className="h-12 border-b border-chalk bg-paper px-4 py-3">
            <div className="h-5 w-24 animate-pulse rounded bg-fog" />
          </div>
          <div className="flex-1 space-y-3 p-4">
            <div className="h-16 animate-pulse rounded-lg bg-paper" />
            <div className="h-16 animate-pulse rounded-lg bg-paper" />
            <div className="h-16 animate-pulse rounded-lg bg-paper" />
            <div className="h-16 animate-pulse rounded-lg bg-paper" />
            <div className="h-16 animate-pulse rounded-lg bg-paper" />
          </div>
        </div>
        <div className="flex flex-1 flex-col bg-mist">
          <div className="flex-1 p-8">
            <div className="mx-auto h-full max-w-4xl rounded-lg border border-chalk bg-paper p-6 shadow-sm">
              <div className="space-y-4">
                <div className="h-6 w-1/3 animate-pulse rounded bg-fog" />
                <div className="h-40 animate-pulse rounded-lg bg-fog" />
                <div className="h-40 animate-pulse rounded-lg bg-fog" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
