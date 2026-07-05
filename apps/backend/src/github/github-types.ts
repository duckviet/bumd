export type GithubInstallationRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly githubInstallationId: string;
  readonly accountName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type GithubRepositoryRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly githubInstallationId: string;
  readonly githubRepoId: string;
  readonly fullName: string;
  readonly docId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type GithubRepoBranchMappingRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly githubRepoId: string;
  readonly branchName: string;
  readonly specPath: string;
  readonly docId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type LinkRepositoryInput = {
  readonly githubInstallationId: string;
  readonly githubRepoId: string;
  readonly fullName: string;
};

export type CreateMappingInput = {
  readonly branchName: string;
  readonly specPath: string;
  readonly docId: string;
};

export type GithubJobData =
  | {
      readonly type: "push";
      readonly payload: PushWebhookPayload;
    }
  | {
      readonly type: "pull_request";
      readonly payload: PullRequestWebhookPayload;
    };

export type PushWebhookPayload = {
  readonly ref: string;
  readonly repository: {
    readonly id: number;
    readonly full_name: string;
  };
  readonly installation?: {
    readonly id: number;
  };
  readonly after: string; // commit sha
};

export type PullRequestWebhookPayload = {
  readonly action: string; // "opened", "synchronize", etc.
  readonly number: number;
  readonly pull_request: {
    readonly head: {
      readonly ref: string;
      readonly sha: string;
    };
    readonly base: {
      readonly ref: string;
      readonly sha: string;
    };
  };
  readonly repository: {
    readonly id: number;
    readonly full_name: string;
  };
  readonly installation?: {
    readonly id: number;
  };
};
