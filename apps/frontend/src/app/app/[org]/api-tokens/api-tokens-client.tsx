"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardApiToken } from "@/entities/dashboard";

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
    <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-6">
      <section className="flex flex-col justify-between gap-5 rounded-lg border border-chalk bg-paper p-6 sm:flex-row">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">Security</p>
          <h1>API Tokens</h1>
          <p className="text-graphite">
            Issue and revoke API tokens to allow automated deployments (e.g. from GitHub Actions) or doc searches.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {mayManage && (
            <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" onClick={handleOpen} type="button">
              Create Token
            </button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-chalk bg-paper p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-chalk pb-4">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase text-sienna-bronze">{tokens.length} active token{tokens.length === 1 ? "" : "s"}</p>
            <h2>Active API Tokens</h2>
          </div>
        </div>

        {tokens.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate p-6 text-graphite">
            <h3>No API tokens active</h3>
            <p>Tokens allow external systems to safely authenticate and upload OpenAPI specs.</p>
            {mayManage && (
              <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog mt-4" onClick={handleOpen} type="button">
                Create the first token
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {tokens.map((token) => (
              <article className="grid grid-cols-1 gap-4 rounded-lg border border-chalk bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_auto]" key={token.id}>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-bold">{token.name}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-graphite">
                    <span>Prefix: <code>{token.tokenPrefix}</code></span>
                    <span>•</span>
                    <span>Role: <strong>{token.role}</strong></span>
                    <span>•</span>
                    <span>Scopes: <code>{token.scopes.join(", ") || "none"}</code></span>
                  </div>
                  <span className="text-xs text-slate">
                    Created: {new Date(token.createdAt).toLocaleString()}
                    {token.lastUsedAt && ` | Last Used: ${new Date(token.lastUsedAt).toLocaleString()}`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {mayManage && (
                    <button
                      onClick={() => handleRevoke(token.id)}
                      type="button"
                      className="inline-flex min-h-8 items-center rounded-full border border-red-200 bg-paper px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4 backdrop-blur-sm" onClick={handleClose}>
          <div className="relative w-full max-w-lg rounded-xl border border-chalk bg-paper p-8 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between border-b border-chalk pb-4">
              <h2>{createdToken ? "Token Created" : "Create API Token"}</h2>
              <button className="grid size-8 place-items-center rounded-full bg-transparent text-xl text-slate hover:bg-fog hover:text-carbon" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>

            {createdToken ? (
              <div className="flex flex-col gap-4 py-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>IMPORTANT:</strong> Copy this API token now. For security reasons, it cannot be shown again.
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase text-graphite">
                    Plaintext Token (Copy this value)
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdToken}
                      className="min-w-0 flex-1 rounded-lg border border-chalk bg-fog p-2 font-mono text-sm"
                      onClick={(event) => event.currentTarget.select()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdToken);
                        alert("Copied to clipboard!");
                      }}
                      className="inline-flex min-h-10 items-center rounded-full bg-carbon px-4 text-sm font-semibold text-paper hover:bg-graphite"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate">
                  Token Prefix: <code>{createdPrefix}</code>
                </div>
                <div className="mt-3 flex justify-end gap-3">
                  <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" type="button" onClick={handleClose}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Token Name
                  <input
                    type="text"
                    placeholder="e.g. GitHub Actions CI/CD"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    className="rounded-lg border border-chalk bg-paper p-2 outline-none focus:border-signal-orange"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Role (Determines permissions)
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="rounded-lg border border-chalk bg-paper p-2 outline-none focus:border-signal-orange"
                  >
                    <option value="owner">Owner (Full Admin Access)</option>
                    <option value="admin">Admin (Manage Docs & Settings)</option>
                    <option value="member">Member (Create & Edit Docs)</option>
                    <option value="guest">Guest (Read Access Only)</option>
                  </select>
                </label>

                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-sm font-bold">Scopes</legend>
                  <div className="flex flex-col gap-2 py-1.5">
                    <label className="flex items-center gap-2 text-sm font-normal">
                      <input
                        type="checkbox"
                        checked={scopes.includes("docs:read")}
                        onChange={() => handleScopeChange("docs:read")}
                      />
                      <code>docs:read</code> - Allow reading documentation specifications and history
                    </label>
                    <label className="flex items-center gap-2 text-sm font-normal">
                      <input
                        type="checkbox"
                        checked={scopes.includes("docs:deploy")}
                        onChange={() => handleScopeChange("docs:deploy")}
                      />
                      <code>docs:deploy</code> - Allow deploying/uploading new documentation versions
                    </label>
                  </div>
                </fieldset>

                <div className="mt-3 flex justify-end gap-3">
                  <button className="border-carbon bg-transparent text-carbon hover:bg-chalk" type="button" onClick={handleClose} disabled={loading}>
                    Cancel
                  </button>
                  <button type="submit" disabled={loading} className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite">
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
