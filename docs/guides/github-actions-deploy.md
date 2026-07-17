# GitHub Actions deploy and diff

The action supports explicit `token` and `oidc` authentication modes. Its manifest runs `dist/index.js`; a publishable release must commit a reproducible `pnpm --filter @bumd/github-action bundle` output. The repository currently ignores `dist/`, so local bundle presence does not mean a GitHub tag contains a runnable action.

Use an immutable commit SHA or a published tag from a release that contains `dist/`. The examples use `bumd/github-action@v1` only as the intended release name.

## Token mode

Create a Bumd token with `docs:deploy`, store it as the repository secret `BUMD_API_TOKEN`, and never place it in repository variables or workflow logs.

```yaml
name: Deploy API docs
on:
  push:
    branches: [main]
    paths: [openapi/payments.yaml]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bumd/github-action@v1
        with:
          command: deploy
          auth_mode: token
          api_url: ${{ vars.BUMD_API_URL }}
          org: acme
          doc: payments
          branch: main
          file: openapi/payments.yaml
          backend_token: ${{ secrets.BUMD_API_TOKEN }}
```

## OIDC mode

OIDC is not auto-detected. Set `auth_mode: oidc`; omitting it selects token mode. The job must grant `id-token: write` so `core.getIDToken()` can obtain the GitHub JWT.

```yaml
name: Deploy API docs with OIDC
on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bumd/github-action@v1
        with:
          command: deploy
          auth_mode: oidc
          api_url: ${{ vars.BUMD_API_URL }}
          org: acme
          doc: payments
          branch: main
          file: openapi/payments.yaml
```

The action currently requests the fixed audience `bumd`; there is no `oidc_audience` input. The backend exchanges the JWT at `POST /v1/auth/github/oidc-token`, then uses the returned Bumd token for the deploy request. Configure the backend as described in [OIDC setup](oidc-setup.md).

## Pull request diff

PR comments additionally require `pull-requests: write` and the workflow `github_token`. The action creates or updates one comment marked `<!-- bumd-diff-comment -->`.

Use Bumd token mode for the current PR flow. GitHub emits a `pull_request` OIDC subject for PR jobs, while the backend currently accepts only `repo:{repository}:ref:{ref}`. OIDC PR exchange is therefore unsupported until a deliberate, secure PR-subject policy is implemented.

```yaml
name: API diff
on:
  pull_request:
    paths: [openapi/payments.yaml]

permissions:
  contents: read
  pull-requests: write

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bumd/github-action@v1
        with:
          command: diff
          auth_mode: token
          api_url: ${{ vars.BUMD_API_URL }}
          org: acme
          doc: payments
          branch: main
          file: openapi/payments.yaml
          backend_token: ${{ secrets.BUMD_API_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          sticky_comment: true
          fail_on_breaking: true
```

Current limitation: `POST /v1/orgs/{org}/docs/{doc}/diffs/preview` returns a placeholder “no functional changes” response rather than comparing the uploaded spec. Stored-version diff mode is usable by supplying `version_id`, but the manifest still requires `file`. Do not treat preview mode as a breaking-change gate until the backend implementation is complete. Comment section ordering for breaking/non-breaking/unknown changes is also not normalized by the action; it embeds backend Markdown.

OIDC remains appropriate for the documented push-to-main deploy example. It is not a replacement for `BUMD_API_TOKEN` in the current pull-request example.

## Inputs that affect authentication and reporting

- `auth_mode`: `token` or `oidc`; defaults to `token`.
- `backend_token`: required by token mode, ignored after a successful OIDC exchange.
- `github_token`: required when `sticky_comment` is true.
- `sticky_comment`: defaults to `true`, including diff runs.
- `fail_on_breaking`: marks the action failed when the backend reports a breaking diff.
- `version_id`: fetches the stored diff for that version instead of previewing the uploaded file.

## Troubleshooting

- **`backend_token is required`:** set `auth_mode: oidc` or provide the secret in token mode.
- **Unable to request OIDC token:** add `permissions: id-token: write`; forked/untrusted workflows may have restricted permissions.
- **OIDC 401:** check issuer/signature/time and ensure backend `GITHUB_OIDC_AUDIENCE=bumd` matches the action's fixed audience.
- **OIDC 403:** repository owner, full repository name, ref, subject, organization slug, or authorization mapping does not match.
- **OIDC PR job is forbidden:** this is expected with the current ref-only backend subject policy; use token mode rather than broadening allowed refs or disabling subject validation.
- **Comment failure:** add `pull-requests: write`, pass `github_token`, and run from a `pull_request` event.
- **Action cannot find `dist/index.js`:** use a release that actually commits the bundle; compiling to `lib/` is not enough for `action.yml`.
