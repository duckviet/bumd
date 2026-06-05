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
    <main className="min-h-screen bg-[#fffdf7] px-6 py-8 text-[#1f2523]">
      <a className="text-sm text-[#65706b] underline" href={`/${orgSlug}/${docSlug}/changes`}>Back to changes</a>
      <article className="mt-6 max-w-3xl rounded border border-[#1f2523]/15 bg-white p-6 shadow-sm">
        {renderMarkdown(markdown)}
      </article>
    </main>
  );
}

function renderMarkdown(markdown: string): readonly React.ReactElement[] {
  return markdown.split("\n").filter((line) => line.trim() !== "").map((line, index) => renderLine(line, index));
}

function renderLine(line: string, index: number): React.ReactElement {
  if (line.startsWith("## ")) {
    return <h1 className="mb-4 text-3xl font-semibold" key={index}>{line.slice(3)}</h1>;
  }
  if (line.startsWith("- ")) {
    return <p className="my-2 border-l-2 border-[#b8613b] pl-3" key={index}>{line.slice(2)}</p>;
  }
  return <p className="my-3" key={index}>{line.replaceAll("`", "")}</p>;
}
