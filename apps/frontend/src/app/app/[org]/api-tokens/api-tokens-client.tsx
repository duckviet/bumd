"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardApiToken } from "../../../../entities/dashboard/api-tokens-store";

type Props = {
  readonly org: string;
  readonly tokens: readonly DashboardApiToken[];
  readonly mayManage: boolean;
};

export function ApiTokensClient({ org, tokens, mayManage }: Props): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const [scopes, setScopes] = useState<string[]>(["docs:read", "docs:deploy"]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdPrefix, setCreatedPrefix] = useState<string | null>(null);

  const router = useRouter();

  const handleOpen = () => {
    setIsOpen(true);
    setName("");
    setRole("member");
    setScopes(["docs:read", "docs:deploy"]);
    setError(null);
    setCreatedToken(null);
    setCreatedPrefix(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    setCreatedToken(null);
    setCreatedPrefix(null);
  };

  const handleScopeChange = (scope: string) => {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter((s) => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/app/${org}/api-tokens/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, scopes }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to create token");
        setLoading(false);
        return;
      }

      const data = await response.json();
      setCreatedToken(data.token);
      setCreatedPrefix(data.apiToken.tokenPrefix);
      setLoading(false);
      router.refresh();
    } catch (err) {
      setError("Connection error");
      setLoading(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    if (!confirm("Are you sure you want to revoke this token? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/app/${org}/api-tokens/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to revoke token");
        return;
      }

      router.refresh();
    } catch (err) {
      alert("Connection error");
    }
  };

  return (
    <div className="dashboard-workspace">
      <section className="dashboard-hero dashboard-hero-compact">
        <div>
          <p className="dashboard-kicker">Security</p>
          <h1>API Tokens</h1>
          <p className="dashboard-lede">
            Issue and revoke API tokens to allow automated deployments (e.g. from GitHub Actions) or doc searches.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          {mayManage && (
            <button className="dashboard-button" onClick={handleOpen} type="button">
              Create Token
            </button>
          )}
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="dashboard-kicker">{tokens.length} active token{tokens.length === 1 ? "" : "s"}</p>
            <h2>Active API Tokens</h2>
          </div>
        </div>

        {tokens.length === 0 ? (
          <div className="dashboard-empty">
            <h3>No API tokens active</h3>
            <p>Tokens allow external systems to safely authenticate and upload OpenAPI specs.</p>
            {mayManage && (
              <button className="dashboard-secondary-action mt-4" onClick={handleOpen} type="button">
                Create the first token
              </button>
            )}
          </div>
        ) : (
          <div className="dashboard-doc-list">
            {tokens.map((token) => (
              <article className="dashboard-doc-row" key={token.id}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>{token.name}</h3>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", fontSize: "13px", color: "#666" }}>
                    <span>Prefix: <code>{token.tokenPrefix}</code></span>
                    <span>•</span>
                    <span>Role: <strong>{token.role}</strong></span>
                    <span>•</span>
                    <span>Scopes: <code>{token.scopes.join(", ") || "none"}</code></span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#999" }}>
                    Created: {new Date(token.createdAt).toLocaleString()}
                    {token.lastUsedAt && ` | Last Used: ${new Date(token.lastUsedAt).toLocaleString()}`}
                  </span>
                </div>
                <div className="dashboard-row-actions" style={{ alignItems: "center" }}>
                  {mayManage && (
                    <button
                      className="dashboard-secondary-action hover:bg-red-50"
                      onClick={() => handleRevoke(token.id)}
                      type="button"
                      style={{ minHeight: "32px", padding: "0 12px", fontSize: "13px", color: "#dc2626", borderColor: "#fecaca" }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {isOpen && (
        <div className="modal-backdrop" onClick={handleClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>{createdToken ? "Token Created" : "Create API Token"}</h2>
              <button className="modal-close" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>

            {createdToken ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
                <div style={{ padding: "12px", background: "#fdf8e2", border: "1px solid #fbe69c", borderRadius: "6px", color: "#664d03", fontSize: "14px" }}>
                  <strong>IMPORTANT:</strong> Copy this API token now. For security reasons, it cannot be shown again.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#666" }}>
                    Plaintext Token (Copy this value)
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      readOnly
                      value={createdToken}
                      style={{ flex: 1, padding: "8px", fontFamily: "monospace", fontSize: "14px", border: "1px solid #d9dedb", borderRadius: "6px", background: "#f8f9fa" }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      className="dashboard-secondary-action"
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdToken);
                        alert("Copied to clipboard!");
                      }}
                      style={{ minHeight: "38px", padding: "0 12px", fontSize: "13px" }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "#828282" }}>
                  Token Prefix: <code>{createdPrefix}</code>
                </div>
                <div className="modal-actions" style={{ marginTop: "12px" }}>
                  <button className="dashboard-button" type="button" onClick={handleClose}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {error && <p className="error-msg">{error}</p>}
                
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  Token Name
                  <input
                    type="text"
                    placeholder="e.g. GitHub Actions CI/CD"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    style={{ padding: "8px", border: "1px solid #d9dedb", borderRadius: "6px" }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  Role (Determines permissions)
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{ padding: "8px", border: "1px solid #d9dedb", borderRadius: "6px" }}
                  >
                    <option value="owner">Owner (Full Admin Access)</option>
                    <option value="admin">Admin (Manage Docs & Settings)</option>
                    <option value="member">Member (Create & Edit Docs)</option>
                    <option value="guest">Guest (Read Access Only)</option>
                  </select>
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "700" }}>Scopes</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "6px 0" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal" }}>
                      <input
                        type="checkbox"
                        checked={scopes.includes("docs:read")}
                        onChange={() => handleScopeChange("docs:read")}
                      />
                      <code>docs:read</code> - Allow reading documentation specifications and history
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal" }}>
                      <input
                        type="checkbox"
                        checked={scopes.includes("docs:deploy")}
                        onChange={() => handleScopeChange("docs:deploy")}
                      />
                      <code>docs:deploy</code> - Allow deploying/uploading new documentation versions
                    </label>
                  </div>
                </div>

                <div className="modal-actions" style={{ marginTop: "12px" }}>
                  <button className="button-secondary" type="button" onClick={handleClose} disabled={loading}>
                    Cancel
                  </button>
                  <button type="submit" disabled={loading} className="dashboard-button">
                    {loading ? "Creating..." : "Create"}
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
