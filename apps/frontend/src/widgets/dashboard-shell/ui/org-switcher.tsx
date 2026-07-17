"use client";

import { useRouter } from "next/navigation";

type Membership = {
  readonly organizationSlug: string;
};

type Props = {
  readonly currentOrg: string;
  readonly memberships: readonly Membership[];
};

export function OrgSwitcher({ currentOrg, memberships }: Props): React.ReactElement {
  const router = useRouter();

  return (
    <div className="inline-flex items-center gap-2">
      <select
        value={currentOrg}
        onChange={(e) => router.push(`/app/${e.target.value}`)}
        className="cursor-pointer rounded-lg border border-chalk bg-paper py-1 pl-2 pr-3 text-sm font-bold text-carbon outline-none focus:border-signal-orange"
      >
        {memberships.map((m) => (
          <option key={m.organizationSlug} value={m.organizationSlug}>
            {m.organizationSlug}
          </option>
        ))}
      </select>
    </div>
  );
}
