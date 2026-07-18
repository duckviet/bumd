"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { DashboardButton } from "./dashboard-primitives";

export function SessionSignInLink({
  callbackPath,
  children,
}: {
  readonly callbackPath?: string;
  readonly children?: ReactNode;
}): React.ReactElement {
  const href = callbackPath
    ? `/login?callbackUrl=${encodeURIComponent(callbackPath)}`
    : "/login";

  return (
    <Link
      className="inline-flex h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper transition-[background-color,border-color] duration-200 hover:border-graphite hover:bg-graphite"
      href={href}
    >
      {children ?? "Sign in"}
    </Link>
  );
}

type FallbackCardProps = {
  readonly label: string;
  readonly title: string;
  readonly detail: string;
  readonly children?: ReactNode;
};

function FallbackCard({ label, title, detail, children }: FallbackCardProps): React.ReactElement {
  return (
    <main className="flex h-[100dvh] items-center justify-center bg-mist px-6 text-carbon">
      <section className="max-w-xl rounded-lg border border-chalk bg-paper p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-slate">{label}</p>
        <h1 className="mt-3 font-polysans text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-slate">{detail}</p>
        {children ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
      </section>
    </main>
  );
}

export function RouteErrorFallback({
  title,
  detail,
  resetAction,
  showSignIn,
}: {
  readonly title: string;
  readonly detail: string;
  readonly resetAction?: () => void;
  readonly showSignIn?: boolean;
}): React.ReactElement {
  return (
    <FallbackCard label="Error" title={title} detail={detail}>
      {resetAction ? (
        <DashboardButton onClick={resetAction} tone="secondary">
          Try again
        </DashboardButton>
      ) : null}
      {showSignIn ? <SessionSignInLink /> : null}
    </FallbackCard>
  );
}

export function RouteNotFoundFallback({
  title,
  detail,
  href,
  linkLabel,
}: {
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly linkLabel: string;
}): React.ReactElement {
  return (
    <FallbackCard label="Not found" title={title} detail={detail}>
      <Link
        className="inline-flex h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon transition-[background-color,border-color] duration-200 hover:border-carbon hover:bg-fog"
        href={href}
      >
        {linkLabel}
      </Link>
    </FallbackCard>
  );
}
