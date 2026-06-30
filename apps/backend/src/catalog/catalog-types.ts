export type PortalDocResponse = {
  readonly slug: string;
  readonly name: string;
  readonly visibility: string;
  readonly defaultBranchSlug: string;
};

export type LatestReadyVersionResponse = {
  readonly id: string;
  readonly branchSlug: string;
  readonly sequenceNumber: number;
  readonly readyAt: string;
  readonly spec: Record<string, unknown>;
};

export type ChangeSummaryResponse = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly hasBreaking: boolean;
};

export type DiffDetailResponse = {
  readonly id: string;
  readonly diffMarkdown: string;
};

export type VersionReadResponse = {
  readonly id: string;
  readonly sha256: string;
  readonly status: string;
  readonly createdAt: string;
  readonly readyAt: string | null;
};

export type VersionDiffResponse = {
  readonly id: string;
  readonly classification: string;
  readonly markdown: string;
  readonly changes: readonly unknown[];
};

export type WebhookResponse = {
  readonly id: string;
  readonly url: string;
  readonly description: string | null;
  readonly eventTypes: readonly string[];
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateWebhookResponse = WebhookResponse & {
  readonly secret: string;
};
