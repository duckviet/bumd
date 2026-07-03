import { createHash } from "node:crypto";
import type { DiffEngineResult } from "@bumd/diff-engine";
import { Inject, Injectable } from "@nestjs/common";
import { parse as parseYaml } from "yaml";
import { DiffClassification, SourceFormat, type DeployJobData, type VersionRecord, type WorkerResult } from "./deploy-types.js";
import { DEPLOY_DIFF_ENGINE, DEPLOY_STORE, type DeployDiffEngine, type DeployStore } from "./deploy-ports.js";
import { WebhookDispatcher } from "../webhooks/webhook-dispatcher.js";
import { WebhookEventType, type WebhookEventPayload } from "../webhooks/webhook-types.js";
import { SEARCH_INDEX, type SearchIndex } from "../search/search-types.js";
import { extractOpenApiSearchDocuments } from "../search/openapi-search-extractor.js";

@Injectable()
export class VersionsWorker {
  public constructor(
    @Inject(DEPLOY_STORE) private readonly store: DeployStore,
    @Inject(DEPLOY_DIFF_ENGINE) private readonly diffEngine: DeployDiffEngine,
    @Inject(SEARCH_INDEX) private readonly searchIndex: SearchIndex,
    private readonly webhookDispatcher: WebhookDispatcher,
  ) {}

  public async process(data: DeployJobData): Promise<WorkerResult> {
    const processingVersion = await this.store.markVersionProcessing(data.versionId);
    try {
      const parsed = await this.parse(processingVersion);
      await this.validate(processingVersion, parsed);
      const diff = await this.diff(processingVersion);
      const version = await this.store.markVersionReady(data.versionId);
      await this.search(version, parsed);
      const webhooks = await this.webhook(version);
      await this.store.markJobCompleted(data.versionId);
      return {
        steps: ["parse", "validate", "diff", "search", "webhook"],
        version,
        diff,
        webhooks,
      };
    } catch (error) {
      const failedVersion = await this.store.markVersionFailed(data.versionId);
      await this.enqueueEvent(failedVersion, WebhookEventType.VersionFailed, {});
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

  private async diff(version: VersionRecord): Promise<WorkerResult["diff"]> {
    const previous = await this.store.previousReadyVersion(version);
    const result = await this.compareWithPrevious(version, previous);
    const classification = toDeployClassification(result);
    await this.store.recordDiff({
      versionId: version.id,
      baseVersionId: previous?.id ?? null,
      classification,
      hasBreaking: result.hasBreaking,
      diffJson: result.diffJson,
      diffMarkdown: result.markdown,
    });
    return {
      classification,
      hasBreaking: result.hasBreaking,
      diffJson: result.diffJson,
      markdown: result.markdown,
    };
  }

  private async compareWithPrevious(version: VersionRecord, previous: VersionRecord | null): Promise<DiffEngineResult> {
    if (previous === null) {
      return this.diffEngine.initialDiff();
    }
    switch (version.sourceFormat) {
      case SourceFormat.OpenApi:
        return this.diffEngine.compareOpenApiSpecs({
          baseSpec: await this.store.getRawSpec(previous.id),
          revisionSpec: await this.store.getRawSpec(version.id),
        });
      case SourceFormat.AsyncApi:
        return this.diffEngine.initialDiff();
      default:
        return assertNever(version.sourceFormat);
    }
  }

  private async webhook(version: VersionRecord): Promise<WorkerResult["webhooks"]> {
    const events: { readonly type: WebhookEventType }[] = [];
    await this.enqueueEvent(version, WebhookEventType.VersionCreated, {});
    events.push({ type: WebhookEventType.VersionCreated });
    const diff = await this.store.diffForVersion(version.id);
    if (diff?.hasBreaking === true) {
      await this.enqueueEvent(version, WebhookEventType.DiffBreakingDetected, {
        diff: {
          hasBreaking: diff.hasBreaking,
          markdown: diff.diffMarkdown,
        },
      });
      events.push({ type: WebhookEventType.DiffBreakingDetected });
    }
    return events;
  }

  private async search(version: VersionRecord, parsed: unknown): Promise<void> {
    const documents = version.sourceFormat === SourceFormat.OpenApi ? extractOpenApiSearchDocuments(version, parsed) : [];
    await this.searchIndex.replaceVersionDocuments({
      organizationId: version.organizationId,
      docId: version.docId,
      branchId: version.branchId,
      versionId: version.id,
      documents,
    });
  }

  private async enqueueEvent(
    version: VersionRecord,
    type: WebhookEventType,
    data: WebhookEventPayload["data"],
  ): Promise<void> {
    try {
      await this.webhookDispatcher.enqueueEvent({
        id: `evt_${version.id}_${type}`,
        type,
        createdAt: new Date().toISOString(),
        organization: { id: version.organizationId, slug: version.organizationId },
        doc: { id: version.docId, slug: version.docId },
        branch: { id: version.branchId, slug: version.branchId },
        version: { id: version.id, sha256: version.sha256, status: version.status },
        data,
      });
    } catch (error) {
      if (error instanceof Error) {
        return;
      }
      throw error;
    }
  }
}

function toDeployClassification(result: DiffEngineResult): DiffClassification {
  switch (result.classification) {
    case "none":
      return DiffClassification.None;
    case "breaking":
      return DiffClassification.Breaking;
    case "warning":
    case "non-breaking":
      return DiffClassification.NonBreaking;
    default: {
      const _exhaustive: never = result.classification;
      throw new Error(`Unknown diff classification: ${String(_exhaustive)}`);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`unexpected_variant:${value}`);
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
