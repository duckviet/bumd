import type { DeployJobData, DeployJobRecord, DiffClassification, SourceFormat, VersionRecord } from "./deploy-types.js";

export const DEPLOY_STORE = Symbol("DEPLOY_STORE");
export const DEPLOY_QUEUE = Symbol("DEPLOY_QUEUE");

export type DeployStore = {
  readonly findVersionByHash: (input: {
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly sha256: string;
  }) => Promise<VersionRecord | null>;
  readonly createQueuedVersion: (input: {
    readonly orgSlug: string;
    readonly docSlug: string;
    readonly branchSlug: string;
    readonly sha256: string;
    readonly sourceFormat: SourceFormat;
    readonly rawSpec: string;
  }) => Promise<{ readonly version: VersionRecord; readonly job: DeployJobRecord }>;
  readonly getRawSpec: (versionId: string) => Promise<string>;
  readonly previousReadyVersion: (version: VersionRecord) => Promise<VersionRecord | null>;
  readonly markVersionProcessing: (versionId: string) => Promise<VersionRecord>;
  readonly markVersionReady: (versionId: string) => Promise<VersionRecord>;
  readonly markVersionFailed: (versionId: string) => Promise<VersionRecord>;
  readonly recordArtifact: (input: {
    readonly versionId: string;
    readonly kind: "normalized_spec";
    readonly contentSha256: string;
  }) => Promise<void>;
  readonly recordDiff: (input: {
    readonly versionId: string;
    readonly classification: DiffClassification;
  }) => Promise<void>;
  readonly recordWebhook: (input: {
    readonly versionId: string;
    readonly type: "version.created" | "version.failed" | "diff.breaking_detected";
  }) => Promise<void>;
  readonly markJobCompleted: (versionId: string) => Promise<void>;
  readonly deployJobCount: () => number;
};

export type DeployQueue = {
  readonly enqueueDeploy: (data: DeployJobData) => Promise<DeployJobRecord>;
};

