export const SourceFormat = {
  OpenApi: "openapi",
  AsyncApi: "asyncapi",
} as const;

export type SourceFormat = (typeof SourceFormat)[keyof typeof SourceFormat];

export type DeployRequestBody = {
  readonly filename: string;
  readonly sourceFormat: SourceFormat;
  readonly specBase64: string;
};

export type DeployCommandResult = {
  readonly skipped: boolean;
  readonly localSha256: string;
  readonly version: {
    readonly id: string;
    readonly sha256: string;
    readonly status: string;
  };
  readonly job?: {
    readonly id: string;
    readonly status: string;
  };
};
