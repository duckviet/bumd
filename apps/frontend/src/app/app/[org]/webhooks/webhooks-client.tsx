"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardWebhook, DashboardWebhookDelivery } from "@/entities/dashboard";
import { StatusBadge } from "@/shared/ui/status-badge";
import { DashboardPageHeader, DashboardSection } from "@/shared/ui/dashboard-primitives";

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
    <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-6">
      <DashboardPageHeader
        kicker="Integrations"
        title="Webhooks"
        description="Configure HTTP webhooks to receive real-time updates when specs are uploaded, fail validation, or contain breaking changes."
        actions={
          mayManage && (
            <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" onClick={handleOpenCreate} type="button">
              Add Webhook
            </button>
          )
        }
      />

      {rotatedSecret && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h3 className="mb-2 text-sm font-bold">Secret Rotated Successfully!</h3>
          <p className="mb-2.5">Here is your new webhook signing secret. Copy it now, it won&apos;t be shown again.</p>
          <div className="flex max-w-lg gap-2">
            <input
              type="text"
              readOnly
              value={rotatedSecret}
              className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-paper px-3 py-2 text-sm outline-none"
              onClick={(event) => event.currentTarget.select()}
            />
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(rotatedSecret);
                alert("Secret copied to clipboard!");
              }}
            >
              Copy
            </button>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog"
              onClick={handleClose}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <DashboardSection
        kicker={`${webhooks.length} webhook${webhooks.length === 1 ? "" : "s"} configured`}
        title="Configured Endpoints"
      >

        {webhooks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate p-6 text-graphite">
            <h3>No webhooks configured</h3>
            <p>Add an endpoint to dispatch spec events and breaking change notifications to your servers.</p>
            {mayManage && (
              <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog mt-4" onClick={handleOpenCreate} type="button">
                Add the first webhook
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {webhooks.map((wh) => {
              const isDelivOpen = selectedWebhookIdForDeliveries === wh.id;
              return (
                <div key={wh.id} className="flex flex-col overflow-hidden rounded-lg border border-chalk bg-paper">
                  <article className="grid grid-cols-1 gap-4 bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-base font-bold">{wh.url}</h3>
                        <span className={`inline-flex min-h-5 items-center rounded-full border px-2 text-xs font-bold ${wh.enabled ? "border-green-200 bg-green-50 text-green-700" : "border-chalk bg-fog text-slate"}`}>
                          {wh.enabled ? "enabled" : "disabled"}
                        </span>
                      </div>
                      <p className="mb-1 mt-0.5 text-sm text-graphite">
                        {wh.description || "No description provided."}
                      </p>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {wh.eventTypes.map((t) => (
                          <code key={t} className="rounded border border-chalk bg-fog px-1.5 py-0.5 text-carbon">
                            {t}
                          </code>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        className="inline-flex min-h-8 items-center rounded-full border border-chalk bg-paper px-2.5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog"
                        onClick={() => handleFetchDeliveries(wh.id)}
                        type="button"
                      >
                        {isDelivOpen ? "Hide Deliveries" : "View Deliveries"}
                      </button>

                      {mayManage && (
                        <>
                          <button
                            className="inline-flex min-h-8 items-center rounded-full border border-chalk bg-paper px-2.5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog"
                            onClick={() => handleOpenEdit(wh)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="inline-flex min-h-8 items-center rounded-full border border-chalk bg-paper px-2.5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog"
                            onClick={() => handleRotateSecret(wh.id)}
                            type="button"
                          >
                            Rotate Secret
                          </button>
                          <button
                            className="inline-flex min-h-8 items-center rounded-full border border-red-200 bg-paper px-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(wh.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </article>

                  {isDelivOpen && (
                    <div className="border-t border-chalk bg-fog p-4">
                      <h4 className="mb-2.5 text-sm font-bold">Webhook Deliveries (Last 20)</h4>
                      {deliveriesLoading ? (
                        <p className="text-sm text-graphite">Loading deliveries...</p>
                      ) : deliveries.length === 0 ? (
                        <p className="text-sm text-graphite">No deliveries recorded for this webhook yet.</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {deliveries.map((del) => (
                            <div key={del.id} className="flex flex-col justify-between gap-2 rounded-lg border border-chalk bg-paper px-3 py-2 text-sm sm:flex-row sm:items-center">
                              <div className="flex items-center gap-2.5">
                                <span className={`inline-block size-2 rounded-full ${del.success ? "bg-green-700" : "bg-red-700"}`} />
                                <strong>{del.eventType}</strong>
                                <span className="text-graphite">Attempts: {del.attemptCount}</span>
                                {del.statusCode && <span className="text-graphite">HTTP {del.statusCode}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {del.lastError && (
                                  <span className="max-w-52 truncate text-xs text-red-700" title={del.lastError}>
                                    Error: {del.lastError}
                                  </span>
                                )}
                                <span className="text-xs text-slate">{new Date(del.createdAt).toLocaleString()}</span>
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
      </DashboardSection>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4 backdrop-blur-sm" onClick={handleClose}>
          <div className="relative w-full max-w-lg rounded-xl border border-chalk bg-paper p-8 shadow-xl" onClick={(e) => e.stopPropagation()} >
            <div className="mb-6 flex items-center justify-between border-b border-chalk pb-4">
              <h2>{createdSecret ? "Webhook Added" : "Add Webhook Endpoint"}</h2>
              <button className="grid size-8 place-items-center rounded-full bg-transparent text-xl text-slate hover:bg-fog hover:text-carbon" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>

            {createdSecret ? (
              <div className="flex flex-col gap-4 py-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>IMPORTANT:</strong> Copy this webhook signing secret. You will need it to verify payload signatures. For security reasons, it cannot be shown again.
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase text-graphite">
                    Signing Secret
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdSecret}
                      className="min-w-0 flex-1 rounded-lg border border-chalk bg-fog px-3 py-2 text-sm outline-none"
                      onClick={(event) => event.currentTarget.select()}
                    />
                    <button
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite"
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdSecret);
                        alert("Signing secret copied!");
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
              <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-url" className="text-sm font-bold uppercase text-graphite">
                    Webhook Destination URL
                  </label>
                  <input
                    id="webhook-url"
                    type="url"
                    required
                    placeholder="https://your-api.com/webhooks"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="rounded-lg border border-chalk bg-paper px-3 py-2 text-sm outline-none focus:border-signal-orange"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-desc" className="text-sm font-bold uppercase text-graphite">
                    Description
                  </label>
                  <input
                    id="webhook-desc"
                    type="text"
                    placeholder="Production delivery alerts"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="rounded-lg border border-chalk bg-paper px-3 py-2 text-sm outline-none focus:border-signal-orange"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="mb-1 text-sm font-bold uppercase text-graphite">
                    Event Subscriptions
                  </span>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={eventTypes.includes("version.created")}
                        onChange={() => handleEventTypeChange("version.created")}
                      />
                      <span><code>version.created</code> — Upload succeeded, new version available</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={eventTypes.includes("version.failed")}
                        onChange={() => handleEventTypeChange("version.failed")}
                      />
                      <span><code>version.failed</code> — Upload failed processing/validation</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={eventTypes.includes("diff.breaking_detected")}
                        onChange={() => handleEventTypeChange("diff.breaking_detected")}
                      />
                      <span><code>diff.breaking_detected</code> — Breaking changes found between spec versions</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-3">
                  <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog" onClick={handleClose} type="button" disabled={loading}>
                    Cancel
                  </button>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" type="submit" disabled={loading}>
                    {loading ? "Adding..." : "Add Endpoint"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {isEditOpen && editingWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4 backdrop-blur-sm" onClick={handleClose}>
          <div className="relative w-full max-w-lg rounded-xl border border-chalk bg-paper p-8 shadow-xl" onClick={(e) => e.stopPropagation()} >
            <div className="mb-6 flex items-center justify-between border-b border-chalk pb-4">
              <h2>Edit Webhook</h2>
              <button className="grid size-8 place-items-center rounded-full bg-transparent text-xl text-slate hover:bg-fog hover:text-carbon" onClick={handleClose} type="button" aria-label="Close">
                &times;
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-webhook-url" className="text-sm font-bold uppercase text-graphite">
                  Webhook Destination URL
                </label>
                <input
                  id="edit-webhook-url"
                  type="url"
                  required
                  placeholder="https://your-api.com/webhooks"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="rounded-lg border border-chalk bg-paper px-3 py-2 text-sm outline-none focus:border-signal-orange"
                />
              </div>

              <div className="my-1 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  id="edit-webhook-enabled"
                  type="checkbox"
                  checked={enabled}
                  onChange={() => setEnabled(!enabled)}
                />
                <label htmlFor="edit-webhook-enabled" className="cursor-pointer font-semibold">Enable Endpoint</label>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="mb-1 text-sm font-bold uppercase text-graphite">
                  Event Subscriptions
                </span>
                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={eventTypes.includes("version.created")}
                      onChange={() => handleEventTypeChange("version.created")}
                    />
                    <span><code>version.created</code></span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={eventTypes.includes("version.failed")}
                      onChange={() => handleEventTypeChange("version.failed")}
                    />
                    <span><code>version.failed</code></span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={eventTypes.includes("diff.breaking_detected")}
                      onChange={() => handleEventTypeChange("diff.breaking_detected")}
                    />
                    <span><code>diff.breaking_detected</code></span>
                  </label>
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-3">
                <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-paper px-5 text-sm font-semibold text-carbon hover:border-carbon hover:bg-fog" onClick={handleClose} type="button" disabled={loading}>
                  Cancel
                </button>
                <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-carbon bg-carbon px-5 text-sm font-semibold text-paper hover:bg-graphite" type="submit" disabled={loading}>
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
