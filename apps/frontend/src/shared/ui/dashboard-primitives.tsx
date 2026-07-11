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

export function DashboardModal({
  children,
  onSubmit,
}: {
  readonly children: ReactNode;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4 backdrop-blur-sm" role="presentation">
      <form className="w-full max-w-md rounded-lg border border-chalk bg-paper p-5 shadow-xl" onSubmit={onSubmit}>
        {children}
      </form>
    </div>
  );
}

export function ModalHeader({ children, onClose }: { readonly children: ReactNode; readonly onClose: () => void }) {
  return (
    <header className="mb-5 flex items-center justify-between border-b border-chalk pb-4">
      <h2 className="text-xl font-semibold">{children}</h2>
      <button
        aria-label="Close dialog"
        className="grid size-8 place-items-center rounded-full text-xl text-slate hover:bg-fog hover:text-carbon"
        onClick={onClose}
        type="button"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </header>
  );
}

export const fieldClassName =
  "mt-1.5 block w-full rounded-lg border border-chalk bg-paper px-3 py-2.5 text-sm text-carbon outline-none transition-colors focus:border-signal-orange";

export function FormField({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <label className="mb-4 block text-sm font-medium text-graphite">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ModalActions({ children }: { readonly children: ReactNode }) {
  return <footer className="mt-5 flex justify-end gap-3">{children}</footer>;
}
