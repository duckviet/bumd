"use client";

import React from "react";
import type { ApiDocument } from "../../entities/openapi/model";
import { SearchBox } from "../search-box/search-box";
import { TryItOutPanel } from "../try-it-out-panel/try-it-out-panel";
import { ThemeToggle } from "./theme-toggle";

function groupOperations(operations: ApiDocument["operations"]) {
  const groups: Record<string, ApiDocument["operations"][number][]> = {};
  for (const op of operations) {
    const tag = op.tags[0] ?? "General";
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(op);
  }
  return Object.entries(groups).map(([tag, ops]) => ({ tag, operations: ops }));
}

function MethodBadge({ method, className = "" }: { method: string; className?: string }) {
  const m = method.toUpperCase();
  let colorClass = "text-text-muted bg-bg-tertiary";
  if (m === "GET") colorClass = "text-[#10b981] bg-get-bg";
  else if (m === "POST") colorClass = "text-[#3b82f6] bg-post-bg";
  else if (m === "PUT" || m === "PATCH") colorClass = "text-[#f59e0b] bg-put-bg";
  else if (m === "DELETE") colorClass = "text-[#ef4444] bg-del-bg";

  return (
    <span className={`inline-flex items-center justify-center font-mono text-[10px] sm:text-xs uppercase font-bold px-2.5 py-0.5 rounded-full w-full whitespace-nowrap ${colorClass} ${className}`}>
      {m}
    </span>
  );
}

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
  const groupedOps = groupOperations(document.operations);

  const [activeOperationId, setActiveOperationId] = React.useState<string>(
    document.operations[0]?.id ?? ""
  );

  const activeOperation = document.operations.find(op => op.id === activeOperationId) ?? document.operations[0] ?? null;

  const schemasToShow = document.schemas.filter(schema =>
    activeOperation?.referencedSchemas?.includes(schema.name)
  );

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace("operation-", "");
            setActiveOperationId(id);
          }
        }
      },
      { rootMargin: "-10% 0px -80% 0px" }
    );

    const elements = window.document.querySelectorAll("article[id^='operation-']");
    for (const el of elements) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [document.operations]);

  return (
    <main className="min-h-screen text-text-secondary bg-bg-primary font-inter selection:bg-amber-500/30">
      <header className="sticky top-0 z-50 border-b border-border-subtle bg-bg-elevated backdrop-blur-md px-8 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-amber-500">Bumd documentation</p>
            <h1 className="mt-2 text-3xl tracking-tight font-polysans font-medium text-text-primary">{document.title}</h1>
            <p className="mt-1 text-sm text-text-muted">Version {document.version}</p>
          </div>
          <div className="flex items-center">
            <a 
              className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors border border-border-subtle rounded-full px-5 py-2.5 bg-bg-secondary hover:bg-bg-tertiary"
              href={`/${orgSlug}/${docSlug}/changes`}
            >
              Changelog
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <SearchBox branchSlug={branchSlug} docSlug={docSlug} orgSlug={orgSlug} versionId={versionId} />

      <div className="grid min-h-[calc(100vh-112px)] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_320px] max-w-7xl mx-auto relative items-start">
        {/* Navigation Sidebar */}
        <aside className="border-b lg:border-b-0 lg:border-r border-border-subtle bg-bg-primary p-6 lg:sticky lg:top-[90px] lg:max-h-[calc(100vh-90px)] overflow-y-auto custom-scrollbar">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted font-inter mb-6">Navigation</h2>
          <nav className="space-y-8">
            {groupedOps.map((group) => (
              <div key={group.tag}>
                <h3 className="text-sm font-medium text-text-primary mb-3 px-3 uppercase tracking-wider">{group.tag}</h3>
                <div className="space-y-1 relative before:absolute before:inset-y-0 before:left-3 before:w-px before:bg-border-subtle">
                  {group.operations.map((operation) => (
                    <a
                      className={`group relative flex items-center gap-3 py-2 pr-3 pl-6 text-sm transition-all font-medium rounded-r-md ${
                        activeOperationId === operation.id
                          ? "text-text-primary bg-bg-secondary"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                      }`}
                      href={`#operation-${operation.id}`}
                      key={operation.id}
                      onClick={() => setActiveOperationId(operation.id)}
                    >
                      <div className={`absolute left-3 w-0.5 bg-amber-500 transition-all ${
                        activeOperationId === operation.id ? "h-full top-0" : "h-0 group-hover:h-full group-hover:top-0"
                      }`}></div>
                      <MethodBadge method={operation.method} className="w-12" />
                      <span className="truncate">{operation.summary || operation.id}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <section className="bg-bg-primary p-8 border-r border-border-subtle lg:min-h-[calc(100vh-90px)]">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted font-inter mb-8">Endpoints</h2>
          
          <div className="space-y-24">
            {groupedOps.map((group) => (
              <div key={group.tag} className="scroll-mt-28" id={`group-${group.tag.toLowerCase()}`}>
                <h2 className="text-3xl font-polysans font-medium text-text-primary border-b border-border-subtle pb-4 mb-8">
                  {group.tag}
                </h2>
                
                <div className="space-y-16">
                  {group.operations.map((operation) => (
                    <article className="scroll-mt-28" id={`operation-${operation.id}`} key={operation.id}>
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-2xl font-semibold font-polysans tracking-tight text-text-primary">{operation.summary || operation.id}</h3>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-bg-secondary border border-border-subtle rounded-lg p-3 overflow-x-auto">
                          <MethodBadge method={operation.method} />
                          <span className="font-mono text-sm text-text-secondary whitespace-nowrap">{operation.path}</span>
                        </div>
                        
                        {operation.description && (
                          <p className="mt-2 text-text-secondary leading-relaxed max-w-3xl">{operation.description}</p>
                        )}
                        
                        {/* Parameters */}
                        <div className="mt-8">
                          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted mb-4 flex items-center gap-2">
                            <span>Parameters</span>
                            <div className="h-px bg-border-subtle flex-1"></div>
                          </h4>
                          
                          {operation.parameters.length === 0 ? (
                            <p className="text-sm text-text-muted italic">No parameters required.</p>
                          ) : (
                            <ul className="space-y-3">
                              {operation.parameters.map((parameter) => (
                                <li className="rounded-lg bg-bg-secondary px-5 py-4 text-sm border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4" key={`${operation.id}-${parameter.location}-${parameter.name}`}>
                                  <div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono font-medium text-text-primary">{parameter.name}</span>
                                      {parameter.required && <span className="text-amber-600 dark:text-amber-500/90 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded-full">required</span>}
                                    </div>
                                    <span className="mt-2 inline-block text-text-muted text-[10px] uppercase tracking-wider bg-bg-tertiary border border-border-subtle px-2.5 py-1 rounded-md font-medium">{parameter.location}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right Sidebar - Schemas & Try it out */}
        <aside className="bg-bg-tertiary p-6 lg:sticky lg:top-[90px] lg:max-h-[calc(100vh-90px)] overflow-y-auto custom-scrollbar border-l border-border-subtle">
          <div className="space-y-12">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted font-inter mb-6">Schemas</h2>
              <div className="space-y-4">
                {schemasToShow.length === 0 ? (
                  <p className="text-xs text-text-muted italic">No schemas referenced by this operation.</p>
                ) : (
                  schemasToShow.map((schema) => (
                    <section className="rounded-xl border border-border-subtle bg-bg-secondary p-5 shadow-sm hover:border-border-strong transition-colors" key={schema.name}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-text-primary font-mono text-sm">{schema.name}</h3>
                        <span className="text-[10px] text-text-muted font-mono uppercase tracking-widest bg-bg-tertiary px-2 py-1 rounded-md border border-border-subtle">{schema.type}</span>
                      </div>
                      {schema.properties.length > 0 && (
                        <div className="pt-3 border-t border-border-subtle">
                          <div className="flex flex-wrap gap-2">
                            {schema.properties.map(prop => (
                              <span className="text-[11px] font-mono bg-bg-primary px-2 py-1 rounded-md text-text-secondary border border-border-subtle" key={prop}>{prop}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  ))
                )}
              </div>
            </div>
            
            <div className="pt-6 border-t border-border-subtle">
              <TryItOutPanel
                branchSlug={branchSlug}
                docSlug={docSlug}
                operation={activeOperation}
                orgSlug={orgSlug}
                serverUrl={document.servers[0] ?? ""}
                versionId={versionId}
              />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
