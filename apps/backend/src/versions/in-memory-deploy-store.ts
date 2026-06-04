import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DiffClassification, VersionStatus, type DeployJobRecord, type SourceFormat, type VersionRecord } from "./deploy-types.js";
import type { DeployStore } from "./deploy-ports.js";

type MutableVersion = VersionRecord & {
  status: VersionRecord["status"];
  readyAt?: string;
};

type WebhookType = "version.created" | "version.failed" | "diff.breaking_detected";

@Injectable()
export class InMemoryDeployStore implements DeployStore {
  private readonly versions = new Map<string, MutableVersion>();
  private readonly rawSpecs = new Map<string, string>();
  private readonly jobs = new Map<string, DeployJobRecord>();
  private readonly diffs = new Map<string, DiffClassification>();
  private readonly webhooks: { readonly versionId: string; readonly type: WebhookType }[] = [];
  private nextSequenceNumber = 1;

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
    this.diffs.set(`${input.versionId}:${input.kind}:${input.contentSha256}`, DiffClassification.None);
  }

  public async recordDiff(input: {
    readonly versionId: string;
    readonly classification: DiffClassification;
  }): Promise<void> {
    this.diffs.set(input.versionId, input.classification);
  }

  public async recordWebhook(input: { readonly versionId: string; readonly type: WebhookType }): Promise<void> {
    this.webhooks.push(input);
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

