import Link from "next/link";

import type { ChangeSummary } from "../../../shared/api/portal-client";
import { Badge, PortalContainer, PortalShell, Surface } from "../../../shared/ui/portal-primitives";

type ChangelogListProps = {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly changes: readonly ChangeSummary[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function ChangelogList({ changes, docSlug, orgSlug }: ChangelogListProps) {
  return (
    <PortalShell>
      <PortalContainer className="max-w-5xl">
        <header className="rounded-lg border border-[#d9dedb] bg-white p-5 sm:p-6">
          <Badge tone="signal">{docSlug}</Badge>
          <h1 className="mt-4 text-3xl font-semibold text-[#202020] sm:text-4xl">Changelog</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#4d4d4d]">
            Published API changes, grouped by generated diff. Breaking changes are called out first.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-[#d9dedb] bg-white px-4 text-sm font-semibold text-[#202020] transition hover:border-[#ff682c] hover:bg-[#fff3ed] hover:text-[#9c3d13]"
              href={`/${orgSlug}/${docSlug}`}
            >
              API Reference
            </Link>
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-[#d9dedb] bg-white px-4 text-sm font-semibold text-[#202020] transition hover:border-[#ff682c] hover:bg-[#fff3ed] hover:text-[#9c3d13]"
              href={`/app/${orgSlug}`}
            >
              Dashboard
            </Link>
          </div>
        </header>

        {changes.length === 0 ? (
          <Surface className="mt-5 p-8">
            <p className="text-sm font-semibold uppercase text-[#828282]">No diffs yet</p>
            <h2 className="mt-3 text-2xl font-semibold text-[#202020]">Upload a newer version to generate a changelog.</h2>
          </Surface>
        ) : (
          <div className="mt-5 space-y-3">
            {changes.map((change) => (
              <Link
                className="block rounded-lg border border-[#d9dedb] bg-white p-5 transition hover:border-[#ff682c] hover:bg-[#fff8f4]"
                href={`/${orgSlug}/${docSlug}/changes/${change.id}`}
                key={change.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={change.hasBreaking ? "danger" : "success"}>
                        {change.hasBreaking ? "Breaking" : "Non-breaking"}
                      </Badge>
                      <Badge>{formatDate(change.createdAt)}</Badge>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-[#202020]">{change.title}</h2>
                  </div>
                  <span className="text-sm font-semibold text-[#9c3d13]">View diff</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PortalContainer>
    </PortalShell>
  );
}
