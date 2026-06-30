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
    <main className="min-h-screen text-carbon bg-mist font-inter">
      <header className="border-b border-chalk bg-paper/95 px-8 py-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-signal-orange">Bumd documentation</p>
            <h1 className="mt-2 text-heading tracking-heading font-polysans text-carbon">{document.title}</h1>
            <p className="mt-1 text-sm text-slate">Version {document.version}</p>
          </div>
          <div>
            <a 
              className="text-sm font-medium text-slate hover:text-carbon transition-colors border border-chalk rounded-full px-4 py-2 bg-fog hover:bg-chalk"
              href={`/${orgSlug}/${docSlug}/changes`}
            >
              Changelog
            </a>
          </div>
        </div>
      </header>
      <SearchBox branchSlug={branchSlug} docSlug={docSlug} orgSlug={orgSlug} versionId={versionId} />
      <div className="grid min-h-[calc(100vh-112px)] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_320px] max-w-7xl mx-auto">
        <aside className="border-b lg:border-b-0 lg:border-r border-chalk bg-fog/50 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate font-inter mb-4">Navigation</h2>
          <nav className="space-y-2">
            {document.operations.map((operation) => (
              <a
                className="block border-l-2 border-slate/30 hover:border-signal-orange py-2 pl-3 text-sm hover:bg-chalk transition-all text-graphite hover:text-carbon font-medium rounded-r-md"
                href={`#operation-${operation.id}`}
                key={operation.id}
              >
                <span className="font-mono text-xs uppercase font-semibold text-signal-orange mr-1.5">{operation.method}</span> {operation.id}
              </a>
            ))}
          </nav>
        </aside>
        <section className="bg-paper p-8 border-r border-chalk">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate font-inter mb-6">Content</h2>
          <div className="space-y-8">
            {document.operations.map((operation) => (
              <article className="scroll-mt-6 rounded-lg border border-chalk bg-paper p-6 shadow-sm" id={`operation-${operation.id}`} key={operation.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-carbon px-3 py-1 font-mono text-xs text-white uppercase">{operation.method}</span>
                  <h3 className="text-2xl font-semibold font-polysans tracking-tight text-carbon">{operation.id}</h3>
                </div>
                <p className="mt-2 font-mono text-sm text-slate bg-fog px-3 py-1.5 rounded-md inline-block">{operation.path}</p>
                <p className="mt-4 text-graphite leading-relaxed">{operation.summary}</p>
                <h4 className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-carbon border-b border-chalk pb-2">Parameters</h4>
                {operation.parameters.length === 0 ? (
                  <p className="mt-3 text-sm text-slate italic">No parameters required.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {operation.parameters.map((parameter) => (
                      <li className="rounded-lg bg-fog px-4 py-3 text-sm border border-chalk/50 flex items-center justify-between" key={`${operation.id}-${parameter.location}-${parameter.name}`}>
                        <div>
                          <span className="font-semibold text-carbon">{parameter.name}</span>
                          <span className="ml-2 text-slate text-xs uppercase bg-chalk px-2 py-0.5 rounded-full font-medium">{parameter.location}</span>
                        </div>
                        {parameter.required ? <span className="text-signal-orange text-xs font-semibold uppercase tracking-wider">required</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
        <aside className="bg-fog/30 p-6 space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate font-inter mb-4">Schemas</h2>
            <div className="space-y-4">
              {document.schemas.map((schema) => (
                <section className="rounded-lg border border-chalk bg-paper p-4 shadow-sm" key={schema.name}>
                  <h3 className="font-semibold text-carbon text-md font-polysans">{schema.name}</h3>
                  <p className="mt-1 text-xs text-slate font-mono uppercase font-semibold">{schema.type}</p>
                  {schema.properties.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-chalk/50">
                      <p className="text-xs text-graphite font-medium">Fields:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {schema.properties.map(prop => (
                          <span className="text-[11px] font-mono bg-fog px-1.5 py-0.5 rounded text-carbon border border-chalk/35" key={prop}>{prop}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
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
