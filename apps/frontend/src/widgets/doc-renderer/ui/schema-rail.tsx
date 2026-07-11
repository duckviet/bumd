"use client";

import { useState } from "react";

import type { ApiSchemaSummary } from "@/entities/openapi";
import { Badge, Surface } from "@/shared/ui/portal-primitives";

type SchemaRailProps = {
  readonly schemas: readonly ApiSchemaSummary[];
  readonly currentTab: "referenced" | "all";
  readonly onTabChange: (tab: "referenced" | "all") => void;
  readonly totalCount: number;
  readonly referencedCount: number;
};

export function SchemaRail({
  schemas,
  currentTab,
  onTabChange,
  totalCount,
  referencedCount,
}: SchemaRailProps) {
  const [copiedSchemaName, setCopiedSchemaName] = useState<string | null>(null);

  const handleCopySchema = (schema: ApiSchemaSummary) => {
    const representation = {
      type: schema.type,
      properties: schema.properties.reduce((acc, prop) => {
        acc[prop.name] = {
          type: prop.type,
          description: prop.description || undefined,
        };
        return acc;
      }, {} as Record<string, any>),
      required: schema.properties.filter((p) => p.required).map((p) => p.name),
    };
    if (representation.required.length === 0) {
      delete (representation as any).required;
    }
    const jsonText = JSON.stringify(representation, null, 2);
    navigator.clipboard.writeText(jsonText).then(() => {
      setCopiedSchemaName(schema.name);
      setTimeout(() => setCopiedSchemaName(null), 2000);
    });
  };

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
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="truncate text-base font-semibold text-[#202020]">{schema.name}</h3>
                <div className="flex items-center gap-2 min-w-0">
                  <Badge>{schema.type}</Badge>
                  <button
                    onClick={() => handleCopySchema(schema)}
                    className="text-xs font-semibold px-2 py-1 rounded border border-[#d9dedb] bg-white text-[#4d4d4d] hover:bg-[#f5f5f5] cursor-pointer transition-all flex items-center gap-1.5"
                    type="button"
                  >
                    {copiedSchemaName === schema.name ? (
                      <>
                        <span className="text-emerald-600">✓</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
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
