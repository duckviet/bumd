import type { ApiOperation } from "@/entities/openapi";

export type TryItOutModalProps = {
  readonly branchSlug: string;
  readonly docSlug: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly operation: ApiOperation | null;
  readonly operations?: readonly ApiOperation[];
  readonly onSelectOperation?: (operation: ApiOperation) => void;
  readonly orgSlug: string;
  readonly versionId: string;
  readonly servers?: readonly string[];
};

export function getStatusColorClass(status: number): string {
  if (status >= 200 && status < 300) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status >= 300 && status < 400) return "text-blue-700 bg-blue-50 border-blue-200";
  if (status >= 400 && status < 500) return "text-amber-700 bg-amber-50 border-amber-200";
  if (status >= 500) return "text-rose-700 bg-rose-50 border-rose-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}
