import type { ApiDocument } from "../../entities/openapi/model";
import { SearchBox } from "../search-box/search-box";
import { TryItOutPanel } from "../try-it-out-panel/try-it-out-panel";

export function DocRenderer({
  document,
  orgSlug,
  docSlug,
  branchSlug,
  versionId,
}: {
  readonly document: ApiDocument;
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
}): React.ReactElement {
  return (
    <main className="min-h-screen text-[#1f2523]">
      <header className="border-b border-[#1f2523]/15 bg-[#f8f7f2]/95 px-6 py-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[#65706b]">Bumd documentation</p>
        <h1 className="mt-2 text-3xl font-semibold">{document.title}</h1>
        <p className="mt-1 text-sm text-[#65706b]">Version {document.version}</p>
      </header>
      <SearchBox branchSlug={branchSlug} docSlug={docSlug} orgSlug={orgSlug} versionId={versionId} />
      <div className="grid min-h-[calc(100vh-112px)] grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="border-b border-[#1f2523]/15 bg-[#ede9dd]/70 p-5 lg:border-b-0 lg:border-r">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Navigation</h2>
          <nav className="mt-5 space-y-2">
            {document.operations.map((operation) => (
              <a
                className="block border-l-2 border-[#b8613b] py-1 pl-3 text-sm hover:bg-[#fffaf0]"
                href={`#operation-${operation.id}`}
                key={operation.id}
              >
                <span className="font-mono text-xs">{operation.method}</span> {operation.id}
              </a>
            ))}
          </nav>
        </aside>
        <section className="bg-[#fffdf7] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#65706b]">Content</h2>
          <div className="mt-6 space-y-8">
            {document.operations.map((operation) => (
              <article className="scroll-mt-6 rounded border border-[#1f2523]/15 bg-white p-5 shadow-sm" id={`operation-${operation.id}`} key={operation.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded bg-[#1f2523] px-2 py-1 font-mono text-xs text-white">{operation.method}</span>
                  <h3 className="text-2xl font-semibold">{operation.id}</h3>
                </div>
                <p className="mt-2 font-mono text-sm text-[#65706b]">{operation.path}</p>
                <p className="mt-4">{operation.summary}</p>
                <h4 className="mt-6 text-sm font-semibold uppercase tracking-[0.16em]">Parameters</h4>
                {operation.parameters.length === 0 ? (
                  <p className="mt-2 text-sm text-[#65706b]">No parameters.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {operation.parameters.map((parameter) => (
                      <li className="rounded bg-[#f8f7f2] px-3 py-2 text-sm" key={`${operation.id}-${parameter.location}-${parameter.name}`}>
                        <span className="font-semibold">{parameter.name}</span>
                        <span className="ml-2 text-[#65706b]">{parameter.location}</span>
                        {parameter.required ? <span className="ml-2 text-[#b8613b]">required</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
        <aside className="border-t border-[#1f2523]/15 bg-[#f2efe6] p-5 lg:border-l lg:border-t-0">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Schemas</h2>
          <div className="mt-5 space-y-4">
            {document.schemas.map((schema) => (
              <section className="rounded border border-[#1f2523]/15 bg-[#fffdf7] p-4" key={schema.name}>
                <h3 className="font-semibold">{schema.name}</h3>
                <p className="mt-1 text-sm text-[#65706b]">{schema.type}</p>
                {schema.properties.length > 0 ? <p className="mt-2 text-sm">Fields: {schema.properties.join(", ")}</p> : null}
              </section>
            ))}
          </div>
          <TryItOutPanel
            branchSlug={branchSlug}
            docSlug={docSlug}
            operation={document.operations[0] ?? null}
            orgSlug={orgSlug}
            serverUrl={document.servers[0] ?? ""}
            versionId={versionId}
          />
        </aside>
      </div>
    </main>
  );
}
