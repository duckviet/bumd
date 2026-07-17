"use client";

import type { ReactNode } from "react";
import { ChevronIcon } from "@/widgets/doc-renderer/ui/operation-nav";

type CollapsibleProps = {
  readonly title: ReactNode;
  readonly isCollapsed: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly headerClassName?: string;
  readonly chevronClassName?: string;
};

export function Collapsible({
  title,
  isCollapsed,
  onToggle,
  children,
  className = "",
  headerClassName = "",
  chevronClassName = "",
}: CollapsibleProps) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        className={headerClassName}
      >
        {title}
        <ChevronIcon
          className={`transform transition-transform duration-200 ${
            isCollapsed ? "-rotate-90" : ""
          } ${chevronClassName}`}
        />
      </button>
      {!isCollapsed && children}
    </div>
  );
}
