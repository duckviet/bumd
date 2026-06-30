export function DiffMarkdown({
  orgSlug,
  docSlug,
  markdown,
}: {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly markdown: string;
}): React.ReactElement {
  return (
    <main className="min-h-screen bg-mist px-6 py-8 text-carbon font-inter">
      <div className="max-w-4xl mx-auto">
        <a className="text-sm font-medium text-slate hover:text-carbon transition-colors" href={`/${orgSlug}/${docSlug}/changes`}>
          ← Back to changes
        </a>
        <article className="mt-6 max-w-3xl rounded-lg border border-chalk bg-paper p-8 shadow-sm">
          {renderMarkdown(markdown)}
        </article>
      </div>
    </main>
  );
}

function renderMarkdown(markdown: string): readonly React.ReactElement[] {
  return markdown.split("\n").filter((line) => line.trim() !== "").map((line, index) => renderLine(line, index));
}

function renderLine(line: string, index: number): React.ReactElement {
  if (line.startsWith("## ")) {
    return <h2 className="mb-4 text-subheading font-medium tracking-subheading font-polysans text-carbon" key={index}>{line.slice(3)}</h2>;
  }
  if (line.startsWith("- ")) {
    return <p className="my-3 border-l-2 border-signal-orange pl-4 text-graphite font-inter leading-relaxed" key={index}>{line.slice(2)}</p>;
  }
  return <p className="my-3 text-carbon font-inter leading-relaxed" key={index}>{line.replaceAll("`", "")}</p>;
}
