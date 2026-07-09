"use client";

import type { KeyValueRow } from "../../../entities/openapi";

type KeyValueTableProps = {
  readonly title: string;
  readonly rows: readonly KeyValueRow[];
  readonly onRowChange: (index: number, updates: Partial<KeyValueRow>) => void;
  readonly onRowDelete: (index: number) => void;
  readonly onAdd: () => void;
  readonly addLabel: string;
  readonly emptyLabel: string;
  readonly errorPrefix: "query" | "header";
  readonly validationErrors: Record<string, string>;
  readonly autofocusRef?: ((el: HTMLInputElement | null) => void) | undefined;
};

export function KeyValueTable({
  title,
  rows,
  onRowChange,
  onRowDelete,
  onAdd,
  addLabel,
  emptyLabel,
  errorPrefix,
  validationErrors,
  autofocusRef,
}: KeyValueTableProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#828282]">{title}</h4>
        <button
          type="button"
          onClick={onAdd}
          className="text-xs text-[#ff682c] font-semibold hover:text-[#e65b24] transition-colors cursor-pointer"
        >
          {addLabel}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-[#828282] italic">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#edf0ee] text-left text-[11px] font-semibold text-[#828282]">
                <th className="py-2 px-1 w-8 text-center">Use</th>
                <th className="py-2 px-2 w-1/3">Key</th>
                <th className="py-2 px-2">Value</th>
                <th className="py-2 px-1 w-8 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const errorKey = `${errorPrefix}-${row.key}`;
                const hasError = Boolean(validationErrors[errorKey]);

                return (
                  <tr key={row.id} className="border-b border-[#edf0ee] last:border-b-0 hover:bg-[#fbfbfa]/50">
                    <td className="py-2 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => onRowChange(index, { enabled: e.target.checked })}
                        className="rounded border-[#d9dedb] text-[#ff682c] focus:ring-[#ff682c] accent-[#ff682c]"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={row.key}
                        readOnly={!row.isCustom}
                        disabled={!row.enabled}
                        onChange={(e) => onRowChange(index, { key: e.target.value })}
                        placeholder="Key"
                        className={`w-full rounded border px-2 py-1 font-mono text-xs transition-all ${
                          row.isCustom
                            ? "border-[#d9dedb] hover:border-[#ff682c]/60 focus:border-[#ff682c] focus:bg-white focus:outline-none"
                            : "border-transparent bg-transparent text-[#4d4d4d] font-semibold focus:outline-none"
                        }`}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={row.value}
                        disabled={!row.enabled}
                        onChange={(e) => onRowChange(index, { value: e.target.value })}
                        placeholder={row.required ? "required" : "optional"}
                        className={`w-full rounded border px-2 py-1 font-mono text-xs transition-all ${
                          hasError
                            ? "border-red-500 bg-red-50/20 focus:outline-none"
                            : "border-[#d9dedb] bg-[#fbfbfa]/60 hover:border-[#ff682c]/60 focus:border-[#ff682c] focus:bg-white focus:outline-none"
                        }`}
                        ref={index === 0 ? autofocusRef : undefined}
                      />
                      {hasError && (
                        <p className="text-[9px] text-red-500 mt-0.5">{validationErrors[errorKey]}</p>
                      )}
                    </td>
                    <td className="py-2 px-1 text-center">
                      {row.isCustom && (
                        <button
                          type="button"
                          onClick={() => onRowDelete(index)}
                          className="text-[#65706b] hover:text-red-500 font-semibold text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
