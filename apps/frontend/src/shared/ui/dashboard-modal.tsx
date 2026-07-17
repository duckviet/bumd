"use client";

import { useEffect, useRef, type ReactNode } from "react";

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

type DashboardModalProps = {
  readonly children: ReactNode;
  readonly onClose?: () => void;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly titleId: string;
};

export function DashboardModal({ children, onClose, onSubmit, titleId }: DashboardModalProps): React.ReactElement {
  const formRef = useRef<HTMLFormElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const form = formRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (form === null) return;

    const focusable = Array.from(form.querySelectorAll<HTMLElement>(focusableSelector));
    if (!form.contains(document.activeElement)) {
      (focusable[0] ?? form).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCloseRef.current !== undefined) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const currentFocusable = Array.from(form.querySelectorAll<HTMLElement>(focusableSelector));
      const first = currentFocusable[0];
      const last = currentFocusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        form.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <form
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-chalk bg-paper p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
        ref={formRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </form>
    </div>
  );
}
