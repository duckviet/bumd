"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardMember, DashboardInvite } from "@/entities/dashboard";

type Props = {
  readonly org: string;
  readonly members: readonly DashboardMember[];
  readonly invites: readonly DashboardInvite[];
  readonly mayManage: boolean;
  readonly currentUserEmail: string;
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

  const getInviteStatus = (invite: DashboardInvite) => {
    if (invite.acceptedAt) return "accepted";
    if (invite.revokedAt) return "revoked";
    if (new Date(invite.expiresAt).getTime() < Date.now()) return "expired";
    return "active";
  };

  return (
    <div className="dashboard-workspace">
      <section className="dashboard-hero dashboard-hero-compact">
        <div>
          <p className="dashboard-kicker">Workspace</p>
          <h1>Members & Invites</h1>
          <p className="dashboard-lede">
            Manage organization members, assign roles, and invite new colleagues to collaborate.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          {mayManage && (
            <button className="dashboard-button" onClick={handleOpen} type="button">
              Invite Member
            </button>
          )}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
        <section className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="dashboard-kicker">{members.length} member{members.length === 1 ? "" : "s"}</p>
              <h2>Organization Members</h2>
            </div>
          </div>

          <div className="dashboard-doc-list">
            {members.map((member) => {
              const isSelf = member.email === currentUserEmail;
              return (
                <article className="dashboard-doc-row" key={member.id}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>
                      {member.name} {isSelf && <span style={{ color: "#ff682c", fontSize: "12px" }}>(You)</span>}
                    </h3>
                    <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#666" }}>
                      <span>{member.email}</span>
                      <span>•</span>
                      <span>Joined: {new Date(member.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="dashboard-row-actions" style={{ alignItems: "center" }}>
                    {mayManage && !isSelf ? (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          style={{
                            padding: "4px 8px",
                            border: "1px solid #d9dedb",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontWeight: "600",
                          }}
                        >
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="member">member</option>
                          <option value="guest">guest</option>
                        </select>
                        <button
                          className="dashboard-secondary-action hover:bg-red-50"
                          onClick={() => handleRemove(member.id)}
                          type="button"
                          style={{
                            minHeight: "32px",
                            padding: "0 12px",
                            fontSize: "13px",
                            color: "#dc2626",
                            borderColor: "#fecaca",
                          }}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="dashboard-badge" style={{ textTransform: "uppercase" }}>
                        {member.role}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h2>Pending Invites</h2>
              <p>Active invite tokens</p>
            </div>
          </div>

          {invites.length === 0 ? (
            <div className="dashboard-empty" style={{ textAlign: "center", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "14px" }}>No invites found.</p>
            </div>
          ) : (
            <div className="dashboard-doc-list" style={{ gap: "8px" }}>
              {invites.map((invite) => {
                const status = getInviteStatus(invite);
                const isActive = status === "active";
                return (
                  <div
                    key={invite.id}
                    style={{
                      padding: "12px",
                      border: "1px solid #d9dedb",
                      borderRadius: "8px",
                      background: "#ffffff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <strong style={{ fontSize: "14px", color: "#202020", display: "block" }}>
                          {invite.email || "Any User (Open Link)"}
                        </strong>
                        <span style={{ fontSize: "12px", color: "#666" }}>Role: {invite.role}</span>
                      </div>
                      <span
                        className="dashboard-badge"
                        style={{
                          fontSize: "11px",
                          padding: "0 6px",
                          minHeight: "18px",
                          background:
                            status === "accepted"
                              ? "#e6f4ea"
                              : status === "revoked"
                              ? "#fce8e6"
                              : status === "expired"
                              ? "#f1f3f4"
                              : "#fff3ed",
                          color:
                            status === "accepted"
                              ? "#137333"
                              : status === "revoked"
                              ? "#c5221f"
                              : status === "expired"
                              ? "#3c4043"
                              : "#9c3d13",
                          borderColor:
                            status === "accepted"
                              ? "#ceead6"
                              : status === "revoked"
                              ? "#fad2cf"
                              : status === "expired"
                              ? "#dadce0"
                              : "#ffd5c2",
                        }}
                      >
                        {status}
                      </span>
                    </div>
                    {isActive && mayManage && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                        <button
                          onClick={() => handleRevokeInvite(invite.id)}
                          type="button"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#dc2626",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: "pointer",
                            padding: 0,
                          }}
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
        <div className="modal-backdrop" onClick={handleClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>{createdInviteLink ? "Invite Created" : "Invite New Member"}</h2>
              <button className="modal-close" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>

            {createdInviteLink ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
                <div style={{ padding: "12px", background: "#fdf8e2", border: "1px solid #fbe69c", borderRadius: "6px", color: "#664d03", fontSize: "14px" }}>
                  <strong>IMPORTANT:</strong> Copy the invite link below. You can send it directly to the user to join this organization.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#666" }}>
                    Invite Link
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      readOnly
                      value={createdInviteLink}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        border: "1px solid #d9dedb",
                        borderRadius: "8px",
                        fontSize: "14px",
                        background: "#f9f9f9",
                        outline: "none",
                      }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      className="dashboard-button"
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdInviteLink);
                        alert("Invite link copied to clipboard!");
                      }}
                      style={{ minHeight: "38px" }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <button className="dashboard-secondary-action mt-4" onClick={handleClose} type="button">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {error && (
                  <div style={{ padding: "10px", background: "#fdf2f2", border: "1px solid #fde8e8", borderRadius: "6px", color: "#e02424", fontSize: "14px" }}>
                    {error}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="invite-email" style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#4d4d4d" }}>
                    Email Address (Optional)
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      border: "1px solid #d9dedb",
                      borderRadius: "8px",
                      fontSize: "14px",
                      outline: "none",
                    }}
                  />
                  <small style={{ color: "#666", fontSize: "11px" }}>
                    Leave blank to create a generic invite link that anyone can use.
                  </small>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="invite-role" style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#4d4d4d" }}>
                    Organization Role
                  </label>
                  <select
                    id="invite-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      border: "1px solid #d9dedb",
                      borderRadius: "8px",
                      fontSize: "14px",
                      outline: "none",
                      background: "#ffffff",
                    }}
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="guest">guest</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "12px" }}>
                  <button className="dashboard-secondary-action" onClick={handleClose} type="button" disabled={loading}>
                    Cancel
                  </button>
                  <button className="dashboard-button" type="submit" disabled={loading}>
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
