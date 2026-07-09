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
    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      <select
        value={currentOrg}
        onChange={(e) => router.push(`/app/${e.target.value}`)}
        style={{
          background: "#ffffff",
          border: "1px solid #d9dedb",
          borderRadius: "8px",
          padding: "4px 12px 4px 8px",
          fontSize: "14px",
          fontWeight: "700",
          color: "#202020",
          cursor: "pointer",
          outline: "none",
        }}
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
