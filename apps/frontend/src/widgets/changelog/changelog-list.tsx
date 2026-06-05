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
    <main className="min-h-screen bg-[#fffdf7] px-6 py-8 text-[#1f2523]">
      <a className="text-sm text-[#65706b] underline" href={`/${orgSlug}/${docSlug}`}>Back to docs</a>
      <h1 className="mt-4 text-3xl font-semibold">Changes</h1>
      <div className="mt-6 space-y-3">
        {changes.map((change) => (
          <a className="block rounded border border-[#1f2523]/15 bg-white p-4 shadow-sm" href={`/${orgSlug}/${docSlug}/changes/${change.id}`} key={change.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{change.title}</h2>
              {change.hasBreaking ? (
                <span className="rounded bg-[#8f2f22] px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">Breaking</span>
              ) : (
                <span className="rounded bg-[#dfe8d7] px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#2e4d32]">Non-breaking</span>
              )}
            </div>
            <time className="mt-2 block text-sm text-[#65706b]">{change.createdAt}</time>
          </a>
        ))}
      </div>
    </main>
  );
}
