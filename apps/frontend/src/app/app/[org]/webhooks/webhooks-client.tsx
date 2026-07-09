"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardWebhook, DashboardWebhookDelivery } from "../../../../entities/dashboard";

type Props = {
  readonly org: string;
  readonly webhooks: readonly DashboardWebhook[];
  readonly mayManage: boolean;
};

export function WebhooksClient({ org, webhooks, mayManage }: Props): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<DashboardWebhook | null>(null);

  // Form fields
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [eventTypes, setEventTypes] = useState<string[]>(["version.created", "diff.breaking_detected"]);

  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [rotatedWebhookId, setRotatedWebhookId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deliveries list
  const [selectedWebhookIdForDeliveries, setSelectedWebhookIdForDeliveries] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<readonly DashboardWebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const router = useRouter();

  const handleOpenCreate = () => {
    setIsOpen(true);
    setUrl("");
    setDescription("");
    setEventTypes(["version.created", "diff.breaking_detected"]);
    setError(null);
    setCreatedSecret(null);
  };

  const handleOpenEdit = (wh: DashboardWebhook) => {
    setEditingWebhook(wh);
    setUrl(wh.url);
    setDescription(wh.description || "");
    setEnabled(wh.enabled);
    setEventTypes([...wh.eventTypes]);
    setError(null);
    setIsEditOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsEditOpen(false);
    setEditingWebhook(null);
    setCreatedSecret(null);
    setRotatedSecret(null);
    setRotatedWebhookId(null);
  };

  const handleEventTypeChange = (type: string) => {
    if (eventTypes.includes(type)) {
      setEventTypes(eventTypes.filter((t) => t !== type));
    } else {
      setEventTypes([...eventTypes, type]);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/app/${org}/webhooks/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, description, eventTypes }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to create webhook");
        setLoading(false);
        return;
      }

      const data = await response.json();
      setCreatedSecret(data.secret);
      setLoading(false);
      router.refresh();
    } catch (err) {
      setError("Connection error");
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebhook) return;
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/app/${org}/webhooks/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId: editingWebhook.id, url, enabled, eventTypes }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to update webhook");
        setLoading(false);
        return;
      }

      setLoading(false);
      setIsEditOpen(false);
      router.refresh();
    } catch (err) {
      setError("Connection error");
      setLoading(false);
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!confirm("Are you sure you want to delete this webhook? Deliveries will be stopped immediately.")) {
      return;
    }

    try {
      const response = await fetch(`/app/${org}/webhooks/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to delete webhook");
        return;
      }

      router.refresh();
    } catch (err) {
      alert("Connection error");
    }
  };

  const handleRotateSecret = async (webhookId: string) => {
    if (!confirm("Are you sure you want to rotate the signing secret? External integrations using the old secret will fail verification.")) {
      return;
    }

    try {
      const response = await fetch(`/app/${org}/webhooks/rotate-secret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to rotate secret");
        return;
      }

      const data = await response.json();
      setRotatedSecret(data.secret);
      setRotatedWebhookId(webhookId);
      router.refresh();
    } catch (err) {
      alert("Connection error");
    }
  };

  const handleFetchDeliveries = async (webhookId: string) => {
    if (selectedWebhookIdForDeliveries === webhookId) {
      // Toggle off
      setSelectedWebhookIdForDeliveries(null);
      setDeliveries([]);
      return;
    }

    setSelectedWebhookIdForDeliveries(webhookId);
    setDeliveriesLoading(true);
    setDeliveries([]);

    try {
      const response = await fetch(`/app/${org}/webhooks/${webhookId}/deliveries`);
      if (!response.ok) {
        alert("Failed to load delivery attempts");
        setDeliveriesLoading(false);
        return;
      }
      const data = await response.json();
      setDeliveries(data.deliveries);
    } catch (err) {
      alert("Failed to load deliveries due to connection error");
    } finally {
      setDeliveriesLoading(false);
    }
  };

  return (
    <div className="dashboard-workspace">
      <section className="dashboard-hero dashboard-hero-compact">
        <div>
          <p className="dashboard-kicker">Integrations</p>
          <h1>Webhooks</h1>
          <p className="dashboard-lede">
            Configure HTTP webhooks to receive real-time updates when specs are uploaded, fail validation, or contain breaking changes.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          {mayManage && (
            <button className="dashboard-button" onClick={handleOpenCreate} type="button">
              Add Webhook
            </button>
          )}
        </div>
      </section>

      {rotatedSecret && (
        <div style={{ padding: "16px", background: "#fdf8e2", border: "1px solid #fbe69c", borderRadius: "8px", color: "#664d03", marginBottom: "20px", fontSize: "14px" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "15px", fontWeight: "700" }}>Secret Rotated Successfully!</h3>
          <p style={{ margin: "0 0 10px 0" }}>Here is your new webhook signing secret. Copy it now, it won&apos;t be shown again.</p>
          <div style={{ display: "flex", gap: "8px", maxWidth: "500px" }}>
            <input
              type="text"
              readOnly
              value={rotatedSecret}
              style={{ flex: 1, padding: "8px 12px", border: "1px solid #fbe69c", borderRadius: "8px", fontSize: "14px", background: "#ffffff", outline: "none" }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              className="dashboard-button"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(rotatedSecret);
                alert("Secret copied to clipboard!");
              }}
              style={{ minHeight: "38px" }}
            >
              Copy
            </button>
            <button
              className="dashboard-secondary-action"
              onClick={handleClose}
              type="button"
              style={{ minHeight: "38px" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <section className="dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="dashboard-kicker">{webhooks.length} webhook{webhooks.length === 1 ? "" : "s"} configured</p>
            <h2>Configured Endpoints</h2>
          </div>
        </div>

        {webhooks.length === 0 ? (
          <div className="dashboard-empty">
            <h3>No webhooks configured</h3>
            <p>Add an endpoint to dispatch spec events and breaking change notifications to your servers.</p>
            {mayManage && (
              <button className="dashboard-secondary-action mt-4" onClick={handleOpenCreate} type="button">
                Add the first webhook
              </button>
            )}
          </div>
        ) : (
          <div className="dashboard-doc-list">
            {webhooks.map((wh) => {
              const isDelivOpen = selectedWebhookIdForDeliveries === wh.id;
              return (
                <div key={wh.id} style={{ display: "flex", flexDirection: "column", border: "1px solid #d9dedb", borderRadius: "8px", overflow: "hidden", background: "#ffffff" }}>
                  <article className="dashboard-doc-row" style={{ border: "none", borderRadius: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>{wh.url}</h3>
                        <span
                          className="dashboard-badge"
                          style={{
                            fontSize: "11px",
                            padding: "0 6px",
                            minHeight: "18px",
                            background: wh.enabled ? "#e6f4ea" : "#f1f3f4",
                            color: wh.enabled ? "#137333" : "#3c4043",
                            borderColor: wh.enabled ? "#ceead6" : "#dadce0",
                          }}
                        >
                          {wh.enabled ? "enabled" : "disabled"}
                        </span>
                      </div>
                      <p style={{ margin: "2px 0 4px", fontSize: "13px", color: "#666" }}>
                        {wh.description || "No description provided."}
                      </p>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "11px" }}>
                        {wh.eventTypes.map((t) => (
                          <code key={t} style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: "4px", color: "#202020", border: "1px solid #e8e8e8" }}>
                            {t}
                          </code>
                        ))}
                      </div>
                    </div>

                    <div className="dashboard-row-actions" style={{ alignItems: "center" }}>
                      <button
                        className="dashboard-secondary-action"
                        onClick={() => handleFetchDeliveries(wh.id)}
                        type="button"
                        style={{ minHeight: "32px", padding: "0 10px", fontSize: "13px" }}
                      >
                        {isDelivOpen ? "Hide Deliveries" : "View Deliveries"}
                      </button>

                      {mayManage && (
                        <>
                          <button
                            className="dashboard-secondary-action"
                            onClick={() => handleOpenEdit(wh)}
                            type="button"
                            style={{ minHeight: "32px", padding: "0 10px", fontSize: "13px" }}
                          >
                            Edit
                          </button>
                          <button
                            className="dashboard-secondary-action"
                            onClick={() => handleRotateSecret(wh.id)}
                            type="button"
                            style={{ minHeight: "32px", padding: "0 10px", fontSize: "13px" }}
                          >
                            Rotate Secret
                          </button>
                          <button
                            className="dashboard-secondary-action hover:bg-red-50"
                            onClick={() => handleDelete(wh.id)}
                            type="button"
                            style={{ minHeight: "32px", padding: "0 10px", fontSize: "13px", color: "#dc2626", borderColor: "#fecaca" }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </article>

                  {isDelivOpen && (
                    <div style={{ borderTop: "1px solid #d9dedb", background: "#f9f9f9", padding: "16px" }}>
                      <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: "700" }}>Webhook Deliveries (Last 20)</h4>
                      {deliveriesLoading ? (
                        <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>Loading deliveries...</p>
                      ) : deliveries.length === 0 ? (
                        <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>No deliveries recorded for this webhook yet.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {deliveries.map((del) => (
                            <div key={del.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff", padding: "8px 12px", border: "1px solid #e8e8e8", borderRadius: "6px", fontSize: "13px" }}>
                              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                <span
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: del.success ? "#137333" : "#c5221f",
                                    display: "inline-block",
                                  }}
                                />
                                <strong>{del.eventType}</strong>
                                <span style={{ color: "#666" }}>Attempts: {del.attemptCount}</span>
                                {del.statusCode && <span style={{ color: "#666" }}>HTTP {del.statusCode}</span>}
                              </div>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                {del.lastError && (
                                  <span style={{ fontSize: "11px", color: "#c5221f", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={del.lastError}>
                                    Error: {del.lastError}
                                  </span>
                                )}
                                <span style={{ color: "#999", fontSize: "11px" }}>{new Date(del.createdAt).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isOpen && (
        <div className="modal-backdrop" onClick={handleClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>{createdSecret ? "Webhook Added" : "Add Webhook Endpoint"}</h2>
              <button className="modal-close" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>

            {createdSecret ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
                <div style={{ padding: "12px", background: "#fdf8e2", border: "1px solid #fbe69c", borderRadius: "6px", color: "#664d03", fontSize: "14px" }}>
                  <strong>IMPORTANT:</strong> Copy this webhook signing secret. You will need it to verify payload signatures. For security reasons, it cannot be shown again.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "#666" }}>
                    Signing Secret
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      readOnly
                      value={createdSecret}
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
                        navigator.clipboard.writeText(createdSecret);
                        alert("Signing secret copied!");
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
              <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {error && (
                  <div style={{ padding: "10px", background: "#fdf2f2", border: "1px solid #fde8e8", borderRadius: "6px", color: "#e02424", fontSize: "14px" }}>
                    {error}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="webhook-url" style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#4d4d4d" }}>
                    Webhook Destination URL
                  </label>
                  <input
                    id="webhook-url"
                    type="url"
                    required
                    placeholder="https://your-api.com/webhooks"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    style={{ padding: "8px 12px", border: "1px solid #d9dedb", borderRadius: "8px", fontSize: "14px", outline: "none" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="webhook-desc" style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#4d4d4d" }}>
                    Description
                  </label>
                  <input
                    id="webhook-desc"
                    type="text"
                    placeholder="Production delivery alerts"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ padding: "8px 12px", border: "1px solid #d9dedb", borderRadius: "8px", fontSize: "14px", outline: "none" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#4d4d4d", marginBottom: "4px" }}>
                    Event Subscriptions
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={eventTypes.includes("version.created")}
                        onChange={() => handleEventTypeChange("version.created")}
                      />
                      <span><code>version.created</code> — Upload succeeded, new version available</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={eventTypes.includes("version.failed")}
                        onChange={() => handleEventTypeChange("version.failed")}
                      />
                      <span><code>version.failed</code> — Upload failed processing/validation</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={eventTypes.includes("diff.breaking_detected")}
                        onChange={() => handleEventTypeChange("diff.breaking_detected")}
                      />
                      <span><code>diff.breaking_detected</code> — Breaking changes found between spec versions</span>
                    </label>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "12px" }}>
                  <button className="dashboard-secondary-action" onClick={handleClose} type="button" disabled={loading}>
                    Cancel
                  </button>
                  <button className="dashboard-button" type="submit" disabled={loading}>
                    {loading ? "Adding..." : "Add Endpoint"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {isEditOpen && editingWebhook && (
        <div className="modal-backdrop" onClick={handleClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>Edit Webhook</h2>
              <button className="modal-close" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {error && (
                <div style={{ padding: "10px", background: "#fdf2f2", border: "1px solid #fde8e8", borderRadius: "6px", color: "#e02424", fontSize: "14px" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="edit-webhook-url" style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#4d4d4d" }}>
                  Webhook Destination URL
                </label>
                <input
                  id="edit-webhook-url"
                  type="url"
                  required
                  placeholder="https://your-api.com/webhooks"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  style={{ padding: "8px 12px", border: "1px solid #d9dedb", borderRadius: "8px", fontSize: "14px", outline: "none" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer", margin: "4px 0" }}>
                <input
                  id="edit-webhook-enabled"
                  type="checkbox"
                  checked={enabled}
                  onChange={() => setEnabled(!enabled)}
                />
                <label htmlFor="edit-webhook-enabled" style={{ cursor: "pointer", fontWeight: "600" }}>Enable Endpoint</label>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#4d4d4d", marginBottom: "4px" }}>
                  Event Subscriptions
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={eventTypes.includes("version.created")}
                      onChange={() => handleEventTypeChange("version.created")}
                    />
                    <span><code>version.created</code></span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={eventTypes.includes("version.failed")}
                      onChange={() => handleEventTypeChange("version.failed")}
                    />
                    <span><code>version.failed</code></span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={eventTypes.includes("diff.breaking_detected")}
                      onChange={() => handleEventTypeChange("diff.breaking_detected")}
                    />
                    <span><code>diff.breaking_detected</code></span>
                  </label>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "12px" }}>
                <button className="dashboard-secondary-action" onClick={handleClose} type="button" disabled={loading}>
                  Cancel
                </button>
                <button className="dashboard-button" type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
