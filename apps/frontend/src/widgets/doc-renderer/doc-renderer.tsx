"use client";

import { useMemo, useState } from "react";

import type { ApiDocument, ApiOperation, ApiSchemaSummary } from "../../entities/openapi/model";
import { Badge, MethodBadge, PortalContainer, PortalShell, Surface } from "../../shared/ui/portal-primitives";
import { SearchBox } from "../search-box/search-box";
import { TryItOutPanel } from "../try-it-out-panel/try-it-out-panel";

type DocRendererProps = {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
  readonly document: ApiDocument;
};

type OperationGroup = {
  readonly tag: string;
  readonly operations: readonly ApiOperation[];
};

function groupOperations(operations: readonly ApiOperation[]): readonly OperationGroup[] {
  const groups = new Map<string, ApiOperation[]>();

  for (const operation of operations) {
    const tag = operation.tags[0] ?? "General";
    const existing = groups.get(tag) ?? [];
    existing.push(operation);
    groups.set(tag, existing);
  }

  return [...groups.entries()].map(([tag, groupedOperations]) => ({
    operations: groupedOperations,
    tag,
  }));
}

function OperationNav({
  activeId,
  groups,
  onSelect,
}: {
  readonly activeId: string | undefined;
  readonly groups: readonly OperationGroup[];
  readonly onSelect: (operation: ApiOperation) => void;
}) {
  return (
    <nav className="space-y-5" aria-label="Operations">
      {groups.map((group) => (
        <div key={group.tag}>
          <p className="mb-2 text-xs font-semibold uppercase text-[#828282]">{group.tag}</p>
          <div className="space-y-1.5">
            {group.operations.map((operation) => {
              const isActive = operation.id === activeId;

              return (
                <a
                  className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                    isActive
                      ? "border-[#ff682c] bg-[#fff3ed] text-[#202020]"
                      : "border-transparent bg-transparent text-[#4d4d4d] hover:border-[#d9dedb] hover:bg-white"
                  }`}
                  href={`#operation-${operation.id}`}
                  key={operation.id}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelect(operation);
                  }}
                >
                  <MethodBadge method={operation.method} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{operation.summary}</span>
                    <span className="block truncate font-mono text-xs text-[#65706b]">{operation.path}</span>
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function OperationDetail({ operation }: { readonly operation: ApiOperation }) {
  return (
    <Surface className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3" id={`operation-${operation.id}`}>
        <MethodBadge method={operation.method} />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-[#202020]">{operation.summary}</h2>
          <p className="mt-2 break-all rounded-lg border border-[#d9dedb] bg-[#f5f5f5] px-3 py-2 font-mono text-sm text-[#4d4d4d]">
            {operation.path}
          </p>
        </div>
      </div>

      {operation.description ? <p className="mt-5 text-base leading-7 text-[#4d4d4d]">{operation.description}</p> : null}

      {operation.parameters.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase text-[#828282]">Parameters</h3>
          <div className="mt-3 overflow-hidden rounded-lg border border-[#d9dedb]">
            {operation.parameters.map((parameter) => (
              <div
                className="grid gap-2 border-b border-[#edf0ee] bg-white px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_120px_90px]"
                key={`${parameter.location}-${parameter.name}`}
              >
                <span className="font-mono text-sm font-semibold text-[#202020]">{parameter.name}</span>
                <span className="text-sm text-[#65706b]">{parameter.location}</span>
                <span className="text-sm text-[#65706b]">{parameter.required ? "Required" : "Optional"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {operation.referencedSchemas.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {operation.referencedSchemas.map((schema) => (
            <Badge key={schema} tone="signal">
              {schema}
            </Badge>
          ))}
        </div>
      ) : null}
    </Surface>
  );
}

function SchemaRail({
  schemas,
  currentTab,
  onTabChange,
  totalCount,
  referencedCount,
}: {
  readonly schemas: readonly ApiSchemaSummary[];
  readonly currentTab: "referenced" | "all";
  readonly onTabChange: (tab: "referenced" | "all") => void;
  readonly totalCount: number;
  readonly referencedCount: number;
}) {
  return (
    <Surface className="p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-[#edf0ee] pb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#828282]">Schemas</h2>
        <div className="flex gap-2">
          <button
            onClick={() => onTabChange("referenced")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all border cursor-pointer ${
              currentTab === "referenced"
                ? "border-[#ff682c] bg-[#fff3ed] text-[#9c3d13]"
                : "border-[#d9dedb] bg-white text-[#4d4d4d] hover:bg-[#f5f5f5]"
            }`}
            type="button"
          >
            Used ({referencedCount})
          </button>
          <button
            onClick={() => onTabChange("all")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all border cursor-pointer ${
              currentTab === "all"
                ? "border-[#ff682c] bg-[#fff3ed] text-[#9c3d13]"
                : "border-[#d9dedb] bg-white text-[#4d4d4d] hover:bg-[#f5f5f5]"
            }`}
            type="button"
          >
            All ({totalCount})
          </button>
        </div>
      </div>

      {schemas.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[#d9dedb] rounded-lg bg-[#fafafa]">
          <p className="text-sm text-[#828282]">No referenced schemas for this operation.</p>
          <button
            onClick={() => onTabChange("all")}
            className="text-xs text-[#ff682c] font-semibold hover:underline mt-2 cursor-pointer"
            type="button"
          >
            View all schemas
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {schemas.map((schema) => (
            <div className="rounded-lg border border-[#edf0ee] bg-[#fafafa] p-4 flex flex-col gap-3" key={schema.name}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="truncate text-base font-semibold text-[#202020]">{schema.name}</h3>
                <Badge>{schema.type}</Badge>
              </div>
              {schema.properties.length > 0 ? (
                <div className="border-t border-[#edf0ee] pt-3 flex flex-col gap-2.5">
                  {schema.properties.map((prop) => (
                    <div key={prop.name} className="flex flex-col gap-1 pb-1.5 border-b border-[#f5f7f6] last:border-b-0 last:pb-0">
                      <div className="flex items-center flex-wrap gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#202020] bg-white border border-[#d9dedb] px-1.5 py-0.5 rounded">
                          {prop.name}
                        </span>
                        <span className="text-[#828282] font-mono">{prop.type}</span>
                        {prop.required ? (
                          <span className="text-[#ff682c] font-bold text-[10px] uppercase tracking-wider">Required</span>
                        ) : null}
                      </div>
                      {prop.description ? (
                        <p className="text-xs text-[#65706b] leading-relaxed pl-1">{prop.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}

export function DocRenderer({ branchSlug, docSlug, document, orgSlug, versionId }: DocRendererProps) {
  const groups = useMemo(() => groupOperations(document.operations), [document.operations]);
  const [activeOperationId, setActiveOperationId] = useState<string | undefined>(document.operations[0]?.id);
  const activeOperation = document.operations.find((operation) => operation.id === activeOperationId) ?? document.operations[0];
  const [schemaTab, setSchemaTab] = useState<"referenced" | "all">("referenced");

  const schemasToShow = useMemo(() => {
    if (schemaTab === "all" || !activeOperation) {
      return document.schemas;
    }
    const referencedNames = activeOperation.referencedSchemas;
    return document.schemas.filter((s) => referencedNames.includes(s.name));
  }, [schemaTab, activeOperation, document.schemas]);

  const referencedCount = activeOperation ? activeOperation.referencedSchemas.length : 0;

  return (
    <PortalShell>
      <PortalContainer>
        <header className="rounded-lg border border-[#d9dedb] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge tone="signal">{document.version}</Badge>
                {document.servers[0] ? <Badge>{document.servers[0]}</Badge> : null}
              </div>
              <h1 className="text-3xl font-semibold text-[#202020] sm:text-4xl">{document.title}</h1>
              <p className="mt-3 text-base leading-7 text-[#4d4d4d]">Interactive OpenAPI reference for the latest published version.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  className="inline-flex min-h-10 items-center rounded-lg border border-[#d9dedb] bg-white px-4 text-sm font-semibold text-[#202020] transition hover:border-[#ff682c] hover:bg-[#fff3ed] hover:text-[#9c3d13]"
                  href={`/${orgSlug}/${docSlug}/changes`}
                >
                  Changelog
                </a>
                <a
                  className="inline-flex min-h-10 items-center rounded-lg border border-[#d9dedb] bg-white px-4 text-sm font-semibold text-[#202020] transition hover:border-[#ff682c] hover:bg-[#fff3ed] hover:text-[#9c3d13]"
                  href={`/app/${orgSlug}`}
                >
                  Dashboard
                </a>
              </div>
            </div>
            <div className="w-full lg:max-w-md">
              <SearchBox 
                branchSlug={branchSlug} 
                docSlug={docSlug} 
                orgSlug={orgSlug} 
                versionId={versionId} 
                onSelectOperation={setActiveOperationId}
              />
            </div>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_360px] lg:items-start">
          <aside className="order-2 lg:order-1 lg:sticky lg:top-5">
            <Surface className="p-4">
              <h2 className="mb-4 text-sm font-semibold uppercase text-[#828282]">Navigation</h2>
              <OperationNav activeId={activeOperation?.id} groups={groups} onSelect={(operation) => setActiveOperationId(operation.id)} />
            </Surface>
          </aside>

          <section className="order-1 min-w-0 space-y-5 lg:order-2">
            {activeOperation ? <OperationDetail operation={activeOperation} /> : null}
            <SchemaRail 
              schemas={schemasToShow} 
              currentTab={schemaTab} 
              onTabChange={setSchemaTab}
              totalCount={document.schemas.length}
              referencedCount={referencedCount}
            />
          </section>

          <aside className="order-3 lg:sticky lg:top-5">
            {activeOperation ? (
              <TryItOutPanel
                branchSlug={branchSlug}
                docSlug={docSlug}
                operation={activeOperation}
                orgSlug={orgSlug}
                serverUrl={document.servers[0] ?? ""}
                versionId={versionId}
              />
            ) : null}
          </aside>
        </div>
      </PortalContainer>
    </PortalShell>
  );
}
