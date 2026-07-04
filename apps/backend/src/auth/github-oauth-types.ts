export type GithubOAuthExchangeInput = {
  readonly githubAccessToken: string;
  readonly organizationSlug: string;
};

export type GithubOAuthUser = {
  readonly id: string;
  readonly login: string;
  readonly email: string | null;
};

export type GithubOAuthEmail = {
  readonly email: string;
  readonly primary: boolean;
  readonly verified: boolean;
};
