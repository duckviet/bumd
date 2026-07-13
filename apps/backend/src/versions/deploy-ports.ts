import type { DiffEngineResult } from "@bumd/diff-engine";
import type { DeployJobData, DeployJobRecord, DiffClassification, PersistedDiffRecord, SourceFormat, VersionRecord } from "./deploy-types.js";

export const DEPLOY_STORE = Symbol("DEPLOY_STORE");
export const DEPLOY_QUEUE = Symbol("DEPLOY_QUEUE");
export const DEPLOY_DIFF_ENGINE = Symbol("DEPLOY_DIFF_ENGINE");

export type DeployStore = {
  readonly findVersionByHash: (input: {
    readonly orgSlug: string;
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
    readonly createdByTokenId: string | null;
    readonly createdByUserId?: string | null;
  }) => Promise<{ readonly version: VersionRecord; readonly job: DeployJobRecord }>;
  readonly getVersion: (versionId: string) => Promise<VersionRecord>;
  readonly getRawSpec: (versionId: string) => Promise<string>;
  readonly previousReadyVersion: (version: VersionRecord) => Promise<VersionRecord | null>;
  readonly markVersionProcessing: (versionId: string) => Promise<VersionRecord>;
  readonly markVersionReady: (versionId: string) => Promise<VersionRecord>;
  readonly markVersionFailed: (versionId: string, error?: unknown) => Promise<VersionRecord>;
  readonly recordArtifact: (input: {
    readonly versionId: string;
    readonly kind: "normalized_spec";
    readonly contentSha256: string;
  }) => Promise<void>;
  readonly recordDiff: (input: {
    readonly versionId: string;
    readonly baseVersionId: string | null;
    readonly classification: DiffClassification;
    readonly hasBreaking: boolean;
    readonly diffJson: unknown;
    readonly diffMarkdown: string;
  }) => Promise<void>;
  readonly diffForVersion: (versionId: string) => Promise<PersistedDiffRecord | null> | PersistedDiffRecord | null;
  readonly markJobCompleted: (versionId: string) => Promise<void>;
  readonly deployJobCount: () => number;
};

export type DeployQueue = {
  readonly enqueueDeploy: (data: DeployJobData) => Promise<DeployJobRecord>;
};

export type DeployDiffEngine = {
  readonly compareOpenApiSpecs: (input: {
    readonly baseSpec: string;
    readonly revisionSpec: string;
  }) => Promise<DiffEngineResult>;
  readonly initialDiff: () => DiffEngineResult;
};
