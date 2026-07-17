import { DashboardLinkButton } from "@/shared/ui/dashboard-primitives";

type DocActionGroupProps = {
  readonly org: string;
  readonly docSlug: string;
  readonly publicUrl: string;
  readonly mayManage: boolean;
  readonly showTests?: boolean;
  readonly size?: "sm" | "md";
};

export function DocActionGroup({
  org,
  docSlug,
  publicUrl,
  mayManage,
  showTests = false,
  size = "md",
}: DocActionGroupProps): React.ReactElement {
  if (size === "sm") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <DashboardLinkButton href={`/app/${org}/docs/${docSlug}/versions`} size="sm">
          Versions
        </DashboardLinkButton>
        <DashboardLinkButton href={`/${org}/${docSlug}/changes`} size="sm">
          Changelog
        </DashboardLinkButton>
        {showTests && (
          <DashboardLinkButton href={`/app/${org}/docs/${docSlug}/tests`} size="sm">
            Tests
          </DashboardLinkButton>
        )}
        {mayManage && (
          <DashboardLinkButton href={`/app/${org}/docs/${docSlug}/settings`} size="sm">
            Settings
          </DashboardLinkButton>
        )}
        <DashboardLinkButton href={publicUrl} size="sm">
          Public
        </DashboardLinkButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <DashboardLinkButton href={publicUrl} size="md" target="_blank" rel="noreferrer">
        <span>Public URL</span>
        <svg className="ml-1.5 size-3.5 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </DashboardLinkButton>
      <DashboardLinkButton href={`/${org}/${docSlug}/changes`} size="md">
        Changelog
      </DashboardLinkButton>
      <DashboardLinkButton href={`/app/${org}/docs/${docSlug}/versions`} size="md">
        Versions
      </DashboardLinkButton>
      {showTests && (
        <DashboardLinkButton href={`/app/${org}/docs/${docSlug}/tests`} size="md">
          Tests
        </DashboardLinkButton>
      )}
      {mayManage && (
        <DashboardLinkButton href={`/app/${org}/docs/${docSlug}/settings`} size="md">
          Settings
        </DashboardLinkButton>
      )}
    </div>
  );
}
