"use client";

import { useEffect, useState } from "react";

import type { ApiOperation } from "../../entities/openapi/model";
import { MethodBadge } from "../../shared/ui/portal-primitives";
import { Collapsible } from "./collapsible";

export type OperationGroup = {
  readonly tag: string;
  readonly operations: readonly ApiOperation[];
};

export function groupOperations(operations: readonly ApiOperation[]): readonly OperationGroup[] {
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

export function ChevronIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

type OperationNavProps = {
  readonly activeId: string | undefined;
  readonly groups: readonly OperationGroup[];
  readonly onSelect: (operation: ApiOperation) => void;
};

export function OperationNav({
  activeId,
  groups,
  onSelect,
}: OperationNavProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeId) return;
    const activeGroup = groups.find((g) => g.operations.some((op) => op.id === activeId));
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
  }, [activeId, groups]);

  const toggleGroup = (tag: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [tag]: !prev[tag],
    }));
  };

  return (
    <nav className="space-y-5" aria-label="Operations">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups[group.tag] ?? false;

        return (
          <Collapsible
            key={group.tag}
            title={<span>{group.tag}</span>}
            isCollapsed={isCollapsed}
            onToggle={() => toggleGroup(group.tag)}
            headerClassName="mb-2 flex w-full items-center justify-between text-left text-xs font-semibold uppercase text-[#828282] hover:text-[#202020] transition-colors cursor-pointer"
            chevronClassName="h-4 w-4"
          >
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
          </Collapsible>
        );
      })}
    </nav>
  );
}
