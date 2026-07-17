"use client";

import { useEffect, useMemo, useState } from "react";

import type { ApiDocument, ApiOperation } from "@/entities/openapi";
import { Badge, PortalContainer, PortalShell, Surface } from "@/shared/ui/portal-primitives";
import { SearchBox } from "@/widgets/search-box";
import { TryItOutPanel } from "@/widgets/try-it-out-panel";
import { OperationNav, groupOperations } from "@/widgets/doc-renderer/ui/operation-nav";
import { OperationDetail } from "@/widgets/doc-renderer/ui/operation-detail";
import { SchemaRail } from "@/widgets/doc-renderer/ui/schema-rail";
import { Collapsible } from "@/widgets/doc-renderer/ui/collapsible";
import { TryItOutModal } from "@/features/try-it-out";

type DocRendererProps = {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly versionId: string;
  readonly document: ApiDocument;
};

export function DocRenderer({ branchSlug, docSlug, document, orgSlug, versionId }: DocRendererProps) {
  const groups = useMemo(() => groupOperations(document.operations), [document.operations]);
  const [activeOperationId, setActiveOperationId] = useState<string | undefined>(document.operations[0]?.id);
  const [tryItOutOperation, setTryItOutOperation] = useState<ApiOperation | null>(null);
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

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeOperationId) return;
    const activeGroup = groups.find((g) => g.operations.some((op) => op.id === activeOperationId));
    if (activeGroup) {
      setCollapsedGroups((prev) => {
        if (prev[activeGroup.tag]) {
          return {
            ...prev,
            [activeGroup.tag]: false,
          };
        }
        return prev;
      });
    }
  }, [activeOperationId, groups]);

  const toggleGroup = (tag: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [tag]: !prev[tag],
    }));
  };

  const handleSelectOperation = (operationId: string) => {
    setActiveOperationId(operationId);
    if (typeof window !== "undefined") {
      const element = window.document.getElementById(`operation-${operationId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <PortalShell>
      <PortalContainer>
        <header className="rounded-lg border border-chalk bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge tone="signal">{document.version}</Badge>
                {document.servers[0] ? <Badge>{document.servers[0]}</Badge> : null}
              </div>
              <h1 className="text-3xl font-semibold text-carbon sm:text-4xl">{document.title}</h1>
              <p className="mt-3 text-base leading-7 text-graphite">Interactive OpenAPI reference for the latest published version.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  className="inline-flex min-h-10 items-center rounded-lg border border-chalk bg-white px-4 text-sm font-semibold text-carbon transition hover:border-signal-orange hover:bg-orange-50 hover:text-orange-800"
                  href={`/${orgSlug}/${docSlug}/changes`}
                >
                  Changelog
                </a>
                <a
                  className="inline-flex min-h-10 items-center rounded-lg border border-chalk bg-white px-4 text-sm font-semibold text-carbon transition hover:border-signal-orange hover:bg-orange-50 hover:text-orange-800"
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
                onSelectOperation={handleSelectOperation}
              />
            </div>
          </div>
        </header>

        <div className="relative mt-5 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className="order-2 pr-1 lg:order-1 lg:sticky lg:top-10 lg:max-h-[calc(100vh-80px)] lg:self-start lg:overflow-y-auto">
            <Surface className="p-4">
              <h2 className="mb-4 text-sm font-semibold uppercase text-slate">
                Navigation
              </h2>
              <OperationNav
                activeId={activeOperation?.id}
                groups={groups}
                onSelect={(operation) => handleSelectOperation(operation.id)}
              />
            </Surface>
          </aside>

          <section className="order-1 min-w-0 space-y-8 lg:order-2">
            {groups.map((group) => {
              const isCollapsed = collapsedGroups[group.tag] ?? false;

              return (
                <Collapsible
                  key={group.tag}
                  title={
                    <h2 className="text-xl font-bold uppercase tracking-wide text-graphite group-hover:text-carbon transition-colors">
                      {group.tag}
                    </h2>
                  }
                  isCollapsed={isCollapsed}
                  onToggle={() => toggleGroup(group.tag)}
                  className="space-y-4"
                  headerClassName="flex w-full items-center justify-between border-b border-chalk pb-2 text-left cursor-pointer group"
                  chevronClassName="h-5 w-5 text-slate group-hover:text-carbon"
                >
                  <div className="space-y-5">
                    {group.operations.map((operation) => (
                      <OperationDetail
                        branchSlug={branchSlug}
                        docSlug={docSlug}
                        key={operation.id}
                        operation={operation}
                        isActive={operation.id === activeOperationId}
                        onSelect={() => handleSelectOperation(operation.id)}
                        orgSlug={orgSlug}
                        versionId={versionId}
                        onTryItOut={setTryItOutOperation}
                      />
                    ))}
                  </div>
                </Collapsible>
              );
            })}
          </section>

          <aside className="order-3 space-y-5 pr-1 lg:sticky lg:top-10 lg:max-h-[calc(100vh-80px)] lg:self-start lg:overflow-y-auto">
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
            <SchemaRail
              schemas={schemasToShow}
              currentTab={schemaTab}
              onTabChange={setSchemaTab}
              totalCount={document.schemas.length}
              referencedCount={referencedCount}
            />
          </aside>
        </div>
      </PortalContainer>
      <TryItOutModal
        branchSlug={branchSlug}
        docSlug={docSlug}
        isOpen={tryItOutOperation !== null}
        onClose={() => setTryItOutOperation(null)}
        operation={tryItOutOperation}
        operations={document.operations}
        onSelectOperation={setTryItOutOperation}
        orgSlug={orgSlug}
        versionId={versionId}
        servers={document.servers}
      />
    </PortalShell>
  );
}
