import Link from "next/link";
import type { DiffDetail } from "@/shared/api/portal-client";
import { Badge, PortalContainer, PortalShell, Surface } from "@/shared/ui/portal-primitives";

type DiffMarkdownProps = {
  readonly markdown?: string;
  readonly diffMarkdown?: string;
  readonly diff?: DiffDetail;
  readonly detail?: DiffDetail;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly [key: string]: unknown;
};

function renderLine(line: string, index: number) {
  if (line.startsWith("### ")) {
    return (
      <h3 className="mt-7 text-lg font-semibold text-carbon" key={index}>
        {line.slice(4)}
      </h3>
    );
  }

  if (line.startsWith("## ")) {
    return (
      <h2 className="mt-8 border-t border-chalk pt-6 text-2xl font-semibold text-carbon" key={index}>
        {line.slice(3)}
      </h2>
    );
  }

  if (line.startsWith("- ")) {
    return (
      <li className="ml-5 list-disc py-1 text-base leading-7 text-graphite" key={index}>
        {line.slice(2)}
      </li>
    );
  }

  if (line.trim().length === 0) {
    return <div className="h-3" key={index} />;
  }

  return (
    <p className="text-base leading-7 text-graphite" key={index}>
      {line}
    </p>
  );
}

export function DiffMarkdown({ detail, diff, diffMarkdown, markdown, orgSlug, docSlug }: DiffMarkdownProps) {
  const renderedMarkdown = markdown ?? diffMarkdown ?? diff?.diffMarkdown ?? detail?.diffMarkdown ?? "";
  const lines = renderedMarkdown.split("\n");

  return (
    <PortalShell>
      <PortalContainer className="max-w-4xl">
        <header className="rounded-lg border border-chalk bg-white p-5 sm:p-6">
          <Badge tone="signal">Diff</Badge>
          <h1 className="mt-4 text-3xl font-semibold text-carbon sm:text-4xl">API change details</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-graphite">
            Generated markdown from the stored diff. Existing rows keep their original markdown until a new diff or reprocess writes it.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-chalk bg-white px-4 text-sm font-semibold text-carbon transition hover:border-signal-orange hover:bg-orange-50 hover:text-orange-800"
              href={`/${orgSlug}/${docSlug}/changes`}
            >
              Changelog
            </Link>
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-chalk bg-white px-4 text-sm font-semibold text-carbon transition hover:border-signal-orange hover:bg-orange-50 hover:text-orange-800"
              href={`/${orgSlug}/${docSlug}`}
            >
              API Reference
            </Link>
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-chalk bg-white px-4 text-sm font-semibold text-carbon transition hover:border-signal-orange hover:bg-orange-50 hover:text-orange-800"
              href={`/app/${orgSlug}`}
            >
              Dashboard
            </Link>
          </div>
        </header>

        <Surface className="mt-5 p-5 sm:p-8">
          <article>{lines.map(renderLine)}</article>
        </Surface>
      </PortalContainer>
    </PortalShell>
  );
}
