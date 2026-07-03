import type { ReactNode } from "react";

type Tone = "neutral" | "signal" | "success" | "danger" | "info" | "warning";

const badgeToneClasses: Record<Tone, string> = {
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  neutral: "border-[#d9dedb] bg-white text-[#4d4d4d]",
  signal: "border-[#ffd5c2] bg-[#fff3ed] text-[#9c3d13]",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
};

const methodTone: Record<string, Tone> = {
  DELETE: "danger",
  GET: "success",
  PATCH: "warning",
  POST: "info",
  PUT: "warning",
};

export function PortalShell({ children }: { readonly children: ReactNode }) {
  return <main className="min-h-screen bg-[#f5f5f5] text-[#202020]">{children}</main>;
}

export function PortalContainer({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={`mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function Surface({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <section className={`rounded-lg border border-[#d9dedb] bg-white ${className}`}>{children}</section>;
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  readonly children: ReactNode;
  readonly tone?: Tone;
  readonly className?: string;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold ${badgeToneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function MethodBadge({ method }: { readonly method: string }) {
  const normalized = method.toUpperCase();

  return (
    <Badge className="font-mono tracking-normal" tone={methodTone[normalized] ?? "neutral"}>
      {normalized}
    </Badge>
  );
}
