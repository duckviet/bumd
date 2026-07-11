"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardMember, DashboardInvite } from "@/entities/dashboard";
import { StatusBadge, type StatusBadgeTone } from "@/shared/ui/status-badge";

type Props = {
  readonly org: string;
  readonly members: readonly DashboardMember[];
  readonly invites: readonly DashboardInvite[];
  readonly mayManage: boolean;
  readonly currentUserEmail: string;
};

type InviteStatus = "accepted" | "active" | "expired" | "revoked";

const inviteStatusTone: Record<InviteStatus, StatusBadgeTone> = {
  accepted: "success",
  active: "warning",
  expired: "neutral",
  revoked: "danger",
};

export function MembersClient({ org, members, invites, mayManage, currentUserEmail }: Props): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);

  const router = useRouter();

  const handleOpen = () => {
    setIsOpen(true);
    setEmail("");
    setRole("member");
    setError(null);
    setCreatedInviteLink(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    setCreatedInviteLink(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/app/${org}/members/invite-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || null, role }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to create invite");
        setLoading(false);
        return;
      }

      const data = await response.json();
      const acceptLink = `${window.location.origin}/accept-invite/${data.token}`;
      setCreatedInviteLink(acceptLink);
      setLoading(false);
      router.refresh();
    } catch (err) {
      setError("Connection error");
      setLoading(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const response = await fetch(`/app/${org}/members/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to update role");
        return;
      }

      router.refresh();
    } catch (err) {
      alert("Connection error");
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this member from the organization?")) {
      return;
    }

    try {
      const response = await fetch(`/app/${org}/members/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to remove member");
        return;
      }

      router.refresh();
    } catch (err) {
      alert("Connection error");
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Are you sure you want to revoke this invite?")) {
      return;
    }

    try {
      const response = await fetch(`/app/${org}/members/invite-revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to revoke invite");
        return;
      }

      router.refresh();
    } catch (err) {
      alert("Connection error");
    }
  };

  const getInviteStatus = (invite: DashboardInvite): InviteStatus => {
    if (invite.acceptedAt) return "accepted";
    if (invite.revokedAt) return "revoked";
    if (new Date(invite.expiresAt).getTime() < Date.now()) return "expired";
    return "active";
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-6">
      <section className="flex flex-col justify-between gap-5 rounded-lg border border-chalk bg-paper p-6 sm:flex-row">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">Workspace</p>
          <h1>Members & Invites</h1>
          <p className="text-graphite">
            Manage organization members, assign roles, and invite new colleagues to collaborate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {mayManage && (
            <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" onClick={handleOpen} type="button">
              Invite Member
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border border-chalk bg-paper p-5 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">{members.length} member{members.length === 1 ? "" : "s"}</p>
              <h2>Organization Members</h2>
            </div>
          </div>

          <div className="grid gap-3">
            {members.map((member) => {
              const isSelf = member.email === currentUserEmail;
              return (
                <article className="grid grid-cols-1 gap-4 rounded-lg border border-chalk bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_auto]" key={member.id}>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-base font-bold">
                      {member.name} {isSelf && <span className="text-xs text-signal-orange">(You)</span>}
                    </h3>
                    <div className="flex flex-wrap gap-2 text-sm text-graphite">
                      <span>{member.email}</span>
                      <span>•</span>
                      <span>Joined: {new Date(member.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {mayManage && !isSelf ? (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          className="rounded-lg border border-chalk bg-paper px-2 py-1 text-sm font-semibold outline-none focus:border-signal-orange"
                        >
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="member">member</option>
                          <option value="guest">guest</option>
                        </select>
                        <button
                          className="inline-flex min-h-8 items-center rounded-full border border-red-200 bg-paper px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                          onClick={() => handleRemove(member.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <StatusBadge label={member.role} />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-chalk bg-paper p-5 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
            <div>
              <h2>Pending Invites</h2>
              <p>Active invite tokens</p>
            </div>
          </div>

          {invites.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate p-4 text-center text-graphite">
              <p className="text-sm">No invites found.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {invites.map((invite) => {
                const status = getInviteStatus(invite);
                const isActive = status === "active";
                return (
                  <div className="rounded-lg border border-chalk bg-paper p-3" key={invite.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm text-carbon">
                          {invite.email || "Any User (Open Link)"}
                        </strong>
                        <span className="text-xs text-graphite">Role: {invite.role}</span>
                      </div>
                      <StatusBadge label={status} tone={inviteStatusTone[status]} />
                    </div>
                    {isActive && mayManage && (
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => handleRevokeInvite(invite.id)}
                          type="button"
                          className="bg-transparent p-0 text-xs font-bold text-red-700 hover:underline"
                        >
                          Revoke Invite
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4 backdrop-blur-sm" onClick={handleClose}>
          <div className="relative w-full max-w-lg rounded-xl border border-chalk bg-paper p-8 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between border-b border-chalk pb-4">
              <h2>{createdInviteLink ? "Invite Created" : "Invite New Member"}</h2>
              <button className="grid size-8 place-items-center rounded-full bg-transparent text-xl text-slate hover:bg-fog hover:text-carbon" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>

            {createdInviteLink ? (
              <div className="flex flex-col gap-4 py-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>IMPORTANT:</strong> Copy the invite link below. You can send it directly to the user to join this organization.
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase text-graphite">
                    Invite Link
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdInviteLink}
                      className="min-w-0 flex-1 rounded-lg border border-chalk bg-fog px-3 py-2 text-sm outline-none"
                      onClick={(event) => event.currentTarget.select()}
                    />
                    <button
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite"
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdInviteLink);
                        alert("Invite link copied to clipboard!");
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog mt-4" onClick={handleClose} type="button">
                  Done
                </button>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold uppercase text-graphite" htmlFor="invite-email">
                    Email Address (Optional)
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-lg border border-chalk bg-paper px-3 py-2 text-sm outline-none focus:border-signal-orange"
                  />
                  <small className="text-xs text-graphite">
                    Leave blank to create a generic invite link that anyone can use.
                  </small>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold uppercase text-graphite" htmlFor="invite-role">
                    Organization Role
                  </label>
                  <select
                    id="invite-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="rounded-lg border border-chalk bg-paper px-3 py-2 text-sm outline-none focus:border-signal-orange"
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="guest">guest</option>
                  </select>
                </div>

                <div className="mt-3 flex justify-end gap-3">
                  <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog" onClick={handleClose} type="button" disabled={loading}>
                    Cancel
                  </button>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" type="submit" disabled={loading}>
                    {loading ? "Generating..." : "Generate Invite"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
