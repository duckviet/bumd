import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { parse as parseYaml } from "yaml";
import { DiffClassification, SourceFormat, type DeployJobData, type VersionRecord, type WorkerResult } from "./deploy-types.js";
import { DEPLOY_STORE, type DeployStore } from "./deploy-ports.js";

@Injectable()
export class VersionsWorker {
  public constructor(@Inject(DEPLOY_STORE) private readonly store: DeployStore) {}

  public async process(data: DeployJobData): Promise<WorkerResult> {
    const processingVersion = await this.store.markVersionProcessing(data.versionId);
    try {
      const parsed = await this.parse(processingVersion);
      await this.validate(processingVersion, parsed);
      const diff = await this.diff(processingVersion);
      await this.webhook(processingVersion, diff.classification);
      const version = await this.store.markVersionReady(data.versionId);
      await this.store.markJobCompleted(data.versionId);
      return {
        steps: ["parse", "validate", "diff", "webhook"],
        version,
        diff,
        webhooks: [{ type: "version.created" }],
      };
    } catch (error) {
      await this.store.markVersionFailed(data.versionId);
      await this.store.recordWebhook({ versionId: data.versionId, type: "version.failed" });
      throw error;
    }
  }

  private async parse(version: VersionRecord): Promise<unknown> {
    const rawSpec = await this.store.getRawSpec(version.id);
    const parsed = parseSpec(rawSpec);
    await this.store.recordArtifact({
      versionId: version.id,
      kind: "normalized_spec",
      contentSha256: createHash("sha256").update(JSON.stringify(parsed)).digest("hex"),
    });
    return parsed;
  }

  private async validate(version: VersionRecord, parsed: unknown): Promise<void> {
    if (!isRecord(parsed)) {
      throw new Error("deploy_processing_failed");
    }

    switch (version.sourceFormat) {
      case SourceFormat.OpenApi:
        if (typeof parsed["openapi"] !== "string") {
          throw new Error("deploy_processing_failed");
        }
        return;
      case SourceFormat.AsyncApi:
        if (typeof parsed["asyncapi"] !== "string") {
          throw new Error("deploy_processing_failed");
        }
        return;
    }
  }

  private async diff(version: VersionRecord): Promise<{ readonly classification: DiffClassification }> {
    const previous = await this.store.previousReadyVersion(version);
    const classification = previous === null ? DiffClassification.None : DiffClassification.NonBreaking;
    await this.store.recordDiff({ versionId: version.id, classification });
    return { classification };
  }

  private async webhook(version: VersionRecord, classification: DiffClassification): Promise<void> {
    await this.store.recordWebhook({ versionId: version.id, type: "version.created" });
    if (classification === DiffClassification.Breaking) {
      await this.store.recordWebhook({ versionId: version.id, type: "diff.breaking_detected" });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSpec(rawSpec: string): unknown {
  try {
    const parsed: unknown = JSON.parse(rawSpec);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return parseYaml(rawSpec);
    }
    throw error;
  }
}
