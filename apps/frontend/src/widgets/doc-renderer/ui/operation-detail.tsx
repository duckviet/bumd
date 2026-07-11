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
            ? "!border-signal-orange ring-1 ring-signal-orange shadow-sm shadow-signal-orange/10"
            : "hover:border-slate"
        }`}
      >
        <div className="flex flex-wrap items-start gap-3">
          <MethodBadge method={operation.method} />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold text-carbon">{operation.summary}</h2>
            <p className="mt-2 break-all rounded-lg border border-chalk bg-fog px-3 py-2 font-mono text-sm text-graphite">
              {operation.path}
            </p>
          </div>
          <button
            className="rounded-lg bg-carbon px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-graphite"
            onClick={(event) => {
              event.stopPropagation();
              onTryItOut?.(operation);
            }}
            type="button"
          >
            Try it out
          </button>
        </div>

        {operation.description ? <p className="mt-5 text-base leading-7 text-graphite">{operation.description}</p> : null}

        {operation.parameters.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase text-slate">Parameters</h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-chalk">
              {operation.parameters.map((parameter) => (
                <div
                  className="grid gap-2 border-b border-chalk bg-white px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_120px_90px]"
                  key={`${parameter.location}-${parameter.name}`}
                >
                  <span className="font-mono text-sm font-semibold text-carbon">{parameter.name}</span>
                  <span className="text-sm text-slate">{parameter.location}</span>
                  <span className="text-sm text-slate">{parameter.required ? "Required" : "Optional"}</span>
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
