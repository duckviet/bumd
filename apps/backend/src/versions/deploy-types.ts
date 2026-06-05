export const SourceFormat = {
  OpenApi: "openapi",
  AsyncApi: "asyncapi",
} as const;

export type SourceFormat = (typeof SourceFormat)[keyof typeof SourceFormat];

export const VersionStatus = {
  Queued: "queued",
  Processing: "processing",
  Ready: "ready",
  Failed: "failed",
} as const;

export type VersionStatus = (typeof VersionStatus)[keyof typeof VersionStatus];

export const DiffClassification = {
  None: "none",
  NonBreaking: "non_breaking",
  Breaking: "breaking",
} as const;

export type DiffClassification = (typeof DiffClassification)[keyof typeof DiffClassification];

export type DeployRequest = {
  readonly orgSlug: string;
  readonly docSlug: string;
  readonly branchSlug: string;
  readonly filename: string;
  readonly sourceFormat: SourceFormat;
  readonly specBase64: string;
};

export type VersionRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly docId: string;
  readonly branchId: string;
  readonly sequenceNumber: number;
  readonly sha256: string;
  readonly sourceFormat: SourceFormat;
  readonly rawSpecObjectKey: string;
  readonly status: VersionStatus;
  readonly createdAt: string;
  readonly readyAt?: string;
};

export type DeployJobRecord = {
  readonly id: string;
  readonly versionId: string;
  readonly jobKey: string;
  readonly status: "queued" | "processing" | "completed" | "failed";
};

export type DeployResult =
  | {
      readonly kind: "created";
      readonly version: VersionRecord;
      readonly job: DeployJobRecord;
    }
  | {
      readonly kind: "skipped";
      readonly version: VersionRecord;
    };

export type DeployJobData = {
  readonly versionId: string;
};

export type PersistedDiffRecord = {
  readonly versionId: string;
  readonly baseVersionId: string | null;
  readonly classification: DiffClassification;
  readonly hasBreaking: boolean;
  readonly diffJson: unknown;
  readonly diffMarkdown: string;
};

export type WorkerResult = {
  readonly steps: readonly ["parse", "validate", "diff", "webhook"];
  readonly version: VersionRecord;
  readonly diff: {
    readonly classification: DiffClassification;
    readonly hasBreaking: boolean;
    readonly diffJson: unknown;
    readonly markdown: string;
  };
  readonly webhooks: readonly {
    readonly type: WebhookEventType;
  }[];
};
import type { WebhookEventType } from "../webhooks/webhook-types.js";
