"use client";

import type { ApiOperation } from "@/entities/openapi";
import { Badge, MethodBadge, Surface } from "@/shared/ui/portal-primitives";

type OperationDetailProps = {
  readonly branchSlug: string;
  readonly docSlug: string;
  readonly operation: ApiOperation;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly orgSlug: string;
  readonly versionId: string;
  readonly onTryItOut?: (operation: ApiOperation) => void;
};

export function OperationDetail({
  branchSlug,
  docSlug,
  operation,
  isActive,
  onSelect,
  orgSlug,
  versionId,
  onTryItOut,
}: OperationDetailProps) {
  return (
    <div
      id={`operation-${operation.id}`}
      className="scroll-mt-5"
      onClick={onSelect}
    >
      <Surface
        className={`p-5 sm:p-6 transition-all duration-200 cursor-pointer ${
          isActive
            ? "!border-[#ff682c] ring-1 ring-[#ff682c] shadow-sm shadow-[#ff682c]/10"
            : "hover:border-[#828282]"
        }`}
      >
        <div className="flex flex-wrap items-start gap-3">
          <MethodBadge method={operation.method} />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold text-[#202020]">{operation.summary}</h2>
            <p className="mt-2 break-all rounded-lg border border-[#d9dedb] bg-[#f5f5f5] px-3 py-2 font-mono text-sm text-[#4d4d4d]">
              {operation.path}
            </p>
          </div>
          <button
            className="rounded-lg bg-[#202020] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4d4d4d]"
            onClick={(event) => {
              event.stopPropagation();
              onTryItOut?.(operation);
            }}
            type="button"
          >
            Try it out
          </button>
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
    </div>
  );
}
