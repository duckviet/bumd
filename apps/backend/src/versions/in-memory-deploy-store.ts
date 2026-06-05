import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { WebhookStore } from "../webhooks/webhook-ports.js";
import type { RegisteredWebhookInput, WebhookDeliveryAttempt, WebhookEndpoint, WebhookEventType } from "../webhooks/webhook-types.js";
import {
  VersionStatus,
  type DeployJobRecord,
  type DiffClassification,
  type PersistedDiffRecord,
  type SourceFormat,
  type VersionRecord,
} from "./deploy-types.js";
import type { DeployStore } from "./deploy-ports.js";

type MutableVersion = VersionRecord & {
  status: VersionRecord["status"];
  readyAt?: string;
};

@Injectable()
export class InMemoryDeployStore implements DeployStore, WebhookStore {
  private readonly versions = new Map<string, MutableVersion>();
  private readonly rawSpecs = new Map<string, string>();
  private readonly jobs = new Map<string, DeployJobRecord>();
  private readonly diffs = new Map<string, PersistedDiffRecord>();
  private readonly webhookEndpoints: WebhookEndpoint[] = [];
  private readonly deliveryAttempts: WebhookDeliveryAttempt[] = [];
  private nextSequenceNumber = 1;
  private nextWebhookId = 1;

  public async findVersionByHash(input: {
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly sha256: string;
  }): Promise<VersionRecord | null> {
    for (const version of this.versions.values()) {
      if (version.docId === input.docSlug && version.branchId === input.branchSlug && version.sha256 === input.sha256) {
        return version;
      }
    }
    return null;
  }

  public async createQueuedVersion(input: {
    readonly orgSlug: string;
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly sha256: string;
    readonly sourceFormat: SourceFormat;
    readonly rawSpec: string;
  }): Promise<{ readonly version: VersionRecord; readonly job: DeployJobRecord }> {
    const versionId = `ver_${this.nextSequenceNumber}`;
    const version: MutableVersion = {
      id: versionId,
      organizationId: input.orgSlug,
      docId: input.docSlug,
      branchId: input.branchSlug,
      sequenceNumber: this.nextSequenceNumber,
      sha256: input.sha256,
      sourceFormat: input.sourceFormat,
      rawSpecObjectKey: `specs/${input.sha256}`,
      status: VersionStatus.Queued,
      createdAt: new Date().toISOString(),
    };
    const job: DeployJobRecord = {
      id: `job_${versionId}`,
      versionId,
      jobKey: `version:${versionId}:parse`,
      status: "queued",
    };
    this.nextSequenceNumber += 1;
    this.versions.set(versionId, version);
    this.rawSpecs.set(versionId, input.rawSpec);
    this.jobs.set(versionId, job);
    return { version, job };
  }

  public async getRawSpec(versionId: string): Promise<string> {
    const rawSpec = this.rawSpecs.get(versionId);
    if (rawSpec === undefined) {
      throw new Error("deploy_processing_failed");
    }
    return rawSpec;
  }

  public async previousReadyVersion(version: VersionRecord): Promise<VersionRecord | null> {
    const candidates = [...this.versions.values()].filter(
      (candidate) =>
        candidate.branchId === version.branchId &&
        candidate.sequenceNumber < version.sequenceNumber &&
        candidate.status === VersionStatus.Ready,
    );
    return candidates.at(-1) ?? null;
  }

  public async markVersionProcessing(versionId: string): Promise<VersionRecord> {
    return this.updateVersionStatus(versionId, VersionStatus.Processing);
  }

  public async markVersionReady(versionId: string): Promise<VersionRecord> {
    return this.updateVersionStatus(versionId, VersionStatus.Ready, new Date().toISOString());
  }

  public async markVersionFailed(versionId: string): Promise<VersionRecord> {
    return this.updateVersionStatus(versionId, VersionStatus.Failed);
  }

  public async recordArtifact(input: {
    readonly versionId: string;
    readonly kind: "normalized_spec";
    readonly contentSha256: string;
  }): Promise<void> {
    void input;
  }

  public async recordDiff(input: {
    readonly versionId: string;
    readonly baseVersionId: string | null;
    readonly classification: DiffClassification;
    readonly hasBreaking: boolean;
    readonly diffJson: unknown;
    readonly diffMarkdown: string;
  }): Promise<void> {
    this.diffs.set(input.versionId, input);
  }

  public diffForVersion(versionId: string): PersistedDiffRecord | null {
    return this.diffs.get(versionId) ?? null;
  }

  public registerWebhook(input: RegisteredWebhookInput): WebhookEndpoint {
    const endpoint: WebhookEndpoint = {
      id: `wh_${this.nextWebhookId}`,
      organizationId: input.organizationId,
      url: input.url,
      secret: input.secret,
      enabled: true,
      eventTypes: input.eventTypes,
    };
    this.nextWebhookId += 1;
    this.webhookEndpoints.push(endpoint);
    return endpoint;
  }

  public async listSubscribedWebhooks(input: {
    readonly organizationId: string;
    readonly eventType: WebhookEventType;
  }): Promise<readonly WebhookEndpoint[]> {
    return this.webhookEndpoints.filter(
      (webhook) =>
        webhook.organizationId === input.organizationId &&
        webhook.enabled &&
        webhook.eventTypes.includes(input.eventType),
    );
  }

  public async getWebhookEndpoint(webhookId: string): Promise<WebhookEndpoint | null> {
    return this.webhookEndpoints.find((webhook) => webhook.id === webhookId) ?? null;
  }

  public async recordDeliveryAttempt(input: Omit<WebhookDeliveryAttempt, "id">): Promise<WebhookDeliveryAttempt> {
    const attempt: WebhookDeliveryAttempt = {
      id: `del_${this.deliveryAttempts.length + 1}`,
      ...input,
    };
    this.deliveryAttempts.push(attempt);
    return attempt;
  }

  public webhookDeliveries(): readonly WebhookDeliveryAttempt[] {
    return this.deliveryAttempts;
  }

  public async markJobCompleted(versionId: string): Promise<void> {
    const job = this.jobs.get(versionId);
    if (job !== undefined) {
      this.jobs.set(versionId, { ...job, status: "completed" });
    }
  }

  public deployJobCount(): number {
    return this.jobs.size;
  }

  private updateVersionStatus(versionId: string, status: VersionRecord["status"], readyAt?: string): VersionRecord {
    const existing = this.versions.get(versionId);
    if (existing === undefined) {
      throw new Error("deploy_processing_failed");
    }
    const next: MutableVersion = readyAt === undefined ? { ...existing, status } : { ...existing, status, readyAt };
    this.versions.set(versionId, next);
    return next;
  }
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
