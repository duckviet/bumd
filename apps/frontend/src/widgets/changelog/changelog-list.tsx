import type { ChangeSummary } from "../../shared/api/portal-client";

export function ChangelogList({
  orgSlug,
  docSlug,
  changes,
}: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly changes: readonly ChangeSummary[];
}): React.ReactElement {
  return (
    <main className="min-h-screen bg-mist px-6 py-8 text-carbon font-inter">
      <div className="max-w-4xl mx-auto">
        <a className="text-sm font-medium text-slate hover:text-carbon transition-colors" href={`/${orgSlug}/${docSlug}`}>
          ← Back to docs
        </a>
        <h1 className="mt-4 text-display font-medium tracking-display text-carbon font-polysans">Changes</h1>
        <div className="mt-8 space-y-4">
          {changes.map((change) => (
            <a 
              className="block rounded-lg border border-chalk bg-paper p-6 transition-all hover:border-slate hover:shadow-sm" 
              href={`/${orgSlug}/${docSlug}/changes/${change.id}`} 
              key={change.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold font-polysans tracking-tight text-carbon">{change.title}</h2>
                {change.hasBreaking ? (
                  <span className="rounded-full bg-signal-orange px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">Breaking</span>
                ) : (
                  <span className="rounded-full bg-chalk px-3 py-1 text-xs font-semibold uppercase tracking-wider text-graphite">Non-breaking</span>
                )}
              </div>
              <time className="mt-3 block text-sm text-slate">{change.createdAt}</time>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
