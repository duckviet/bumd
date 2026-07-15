import type { ReactNode } from "react";

type ButtonTone = "primary" | "secondary" | "danger";

const buttonToneClasses: Record<ButtonTone, string> = {
  primary: "border-carbon bg-carbon text-paper hover:border-graphite hover:bg-graphite",
  secondary: "border-chalk bg-paper text-carbon hover:border-carbon hover:bg-fog",
  danger: "border-red-200 bg-paper text-red-700 hover:bg-red-50",
};

export function DashboardButton({
  children,
  className = "",
  disabled = false,
  onClick,
  tone = "primary",
  type = "button",
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly tone?: ButtonTone;
  readonly type?: "button" | "submit";
}): React.ReactElement {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-full border px-5 text-sm font-semibold transition-[background-color,border-color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${buttonToneClasses[tone]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function ModalHeader({ children, id, onClose }: { readonly children: ReactNode; readonly id?: string; readonly onClose: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-chalk p-4">
      <h2 className="font-polysans text-xl font-normal tracking-tight text-carbon" id={id}>{children}</h2>
      <button
        aria-label="Close dialog"
        className="grid size-8 place-items-center rounded-full bg-transparent text-xl text-slate transition-colors hover:bg-fog hover:text-carbon"
        onClick={onClose}
        type="button"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </header>
  );
}

export const fieldClassName =
  "mt-1.5 block w-full rounded-lg border border-chalk bg-paper px-3 py-2.5 text-sm text-carbon outline-none transition-colors placeholder:text-slate focus:border-signal-orange";

export function FormField({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <label className="mb-4 block text-sm font-medium text-graphite text-left">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ModalActions({ children }: { readonly children: ReactNode }) {
  return <footer className="mt-5 flex justify-end gap-3">{children}</footer>;
}

export function ModalError({ children }: { readonly children: ReactNode }) {
  return (
    <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {children}
    </p>
  );
}

export function DashboardNavLink({
  active,
  children,
  href,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly href: string;
}): React.ReactElement {
  return (
    <a
      className={
        active
          ? "inline-flex h-9 shrink-0 items-center rounded-full bg-carbon px-4 text-sm font-semibold text-white"
          : "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium text-graphite transition-colors hover:bg-fog hover:text-carbon"
      }
      href={href}
    >
      {children}
    </a>
  );
}

export function DashboardLinkButton({
  children,
  href,
  target,
  rel,
  className = "",
  size = "md",
}: {
  readonly children: ReactNode;
  readonly href: string;
  readonly target?: string;
  readonly rel?: string;
  readonly className?: string;
  readonly size?: "sm" | "md";
}): React.ReactElement {
  const sizeClasses =
    size === "sm"
      ? "h-8 px-3 text-xs bg-fog hover:border-carbon"
      : "h-9 px-4 text-xs bg-paper transition-all hover:border-carbon hover:bg-fog hover:scale-[1.02] active:scale-[0.98]";

  return (
    <a
      className={`inline-flex items-center justify-center rounded-full border border-chalk font-semibold text-carbon ${sizeClasses} ${className}`}
      href={href}
      rel={rel}
      target={target}
    >
      {children}
    </a>
  );
}

export function InfoCard({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-chalk bg-paper p-5 hover:border-slate/50 transition-colors">
      <p className="text-xs font-bold uppercase tracking-wider text-slate">{label}</p>
      {children}
    </div>
  );
}

export function DashboardPageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  readonly kicker: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}): React.ReactElement {
  return (
    <section className="flex flex-col justify-between gap-5 rounded-lg border border-chalk bg-paper p-6 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-sienna-bronze">{kicker}</p>
        <h1 className="font-polysans text-3xl font-bold tracking-tight text-carbon">{title}</h1>
        <p className="mt-2 text-sm text-graphite">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </section>
  );
}

export function DashboardSection({
  kicker,
  title,
  actions,
  children,
}: {
  readonly kicker?: string;
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-lg border border-chalk bg-paper p-5">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
        <div>
          {kicker ? <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-sienna-bronze">{kicker}</p> : null}
          <h2 className="font-polysans text-2xl font-bold tracking-tight text-carbon">{title}</h2>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
