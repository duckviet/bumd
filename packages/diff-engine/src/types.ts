export const DiffEngineClassification = {
  None: "none",
  NonBreaking: "non-breaking",
  Warning: "warning",
  Breaking: "breaking",
} as const;

export type DiffEngineClassification = (typeof DiffEngineClassification)[keyof typeof DiffEngineClassification];

export const DiffChangeKind = {
  RemovedEndpoint: "removed_endpoint",
  AddedEndpoint: "added_endpoint",
  AddedRequiredParameter: "added_required_parameter",
  ResponseTypeChanged: "response_type_changed",
  AddedOptionalField: "added_optional_field",
} as const;

export type DiffChangeKind = (typeof DiffChangeKind)[keyof typeof DiffChangeKind];

export type DiffChange = {
  readonly kind: DiffChangeKind;
  readonly path: string;
  readonly method?: string;
  readonly location?: string;
  readonly severity: Exclude<DiffEngineClassification, "none">;
  readonly message: string;
};

export type DiffJson = {
  readonly changes: readonly DiffChange[];
  readonly oasdiff?: unknown;
};

export type DiffEngineResult = {
  readonly classification: DiffEngineClassification;
  readonly hasBreaking: boolean;
  readonly diffJson: DiffJson;
  readonly markdown: string;
};

export type DiffEngineInput = {
  readonly baseSpec: string;
  readonly revisionSpec: string;
  readonly binaryPath?: string;
  readonly timeoutMs?: number;
};

export type InitialDiffInput = {
  readonly title?: string;
};
