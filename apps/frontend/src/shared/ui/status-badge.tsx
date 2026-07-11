export type StatusBadgeTone = "neutral" | "danger" | "warning" | "success";

type StatusBadgeProps = {
  readonly label: string;
  readonly tone?: StatusBadgeTone;
};

const toneClasses: Record<StatusBadgeTone, string> = {
  danger: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-chalk bg-fog text-slate",
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-orange-200 bg-orange-50 text-orange-700",
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-3 text-xs font-medium ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
