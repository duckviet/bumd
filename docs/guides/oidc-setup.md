# GitHub Actions OIDC setup

BUMD can exchange a GitHub Actions OIDC JWT for a deploy-scoped API token at `POST /v1/auth/github/oidc-token`. The current implementation is suitable for integration testing, but several planned production controls remain missing; review the gaps below before deployment.

## Current authorization model

OIDC authorization is configured through `GITHUB_OIDC_AUTHORIZATIONS`, not through Prisma. The value is a JSON array:

```bash
export GITHUB_OIDC_AUDIENCE=bumd
export GITHUB_OIDC_AUTHORIZATIONS='[
  {
    "organizationSlug": "acme",
    "repositoryOwner": "octo",
    "repositories": ["octo/payments"],
    "allowedRefs": ["refs/heads/main"]
  }
]'
```

Use deployment-platform secret/config injection rather than committing this configuration. Although the mapping is not itself an API token, it is security policy and should be change-controlled.

The JWT verifier uses GitHub issuer `https://token.actions.githubusercontent.com`, GitHub's JWKS endpoint, RS256, `exp`, optional `nbf`, and an issued-at age of at most five minutes plus clock skew. `GITHUB_OIDC_JWKS_URL` exists for controlled tests and should normally remain unset.

The action requests audience `bumd`, so configure `GITHUB_OIDC_AUDIENCE=bumd`. The backend additionally requires:

- the request's `organizationSlug` to match an authorization entry;
- `repository_owner` and full `repository` to match that entry;
- the JWT `ref` to be in `allowedRefs`;
- the JWT `sub` to equal `repo:{repository}:ref:{ref}`.

## Database setup

Apply the repository's existing append-only migrations:

```bash
DATABASE_URL=postgresql://bumd:bumd@127.0.0.1:5436/bumd \
  pnpm exec prisma migrate deploy --schema apps/backend/prisma/schema.prisma
```

There is currently no `GitHubOrgMapping` or `GitHubOidcAudit` model/migration. The existing `GithubInstallation`, `GithubRepository`, and `GithubRepoBranchMapping` tables support GitHub App integration; they do not authorize OIDC exchange. Do not seed them expecting OIDC access to work.

## Workflow permissions

Every OIDC job must include:

```yaml
permissions:
  contents: read
  id-token: write
```

Also set `auth_mode: oidc` on the Bumd action. See [GitHub Actions deploy and diff](github-actions-deploy.md).

The current backend subject policy supports ref-based jobs such as a push to `refs/heads/main`. It does not support GitHub's `pull_request` OIDC subject. Use token mode for PR diff jobs until a separate least-privilege PR policy is designed and implemented.

## Operational verification

1. Confirm PostgreSQL is reachable and migrations are applied.
2. Start the current development server and observe `manual-server-ready http://127.0.0.1:3100`.
3. Confirm an unauthenticated read reaches the listener; `GET /v1/dashboard/me` should return 401, not a connection error. This is not a dependency health check.
4. Run an OIDC workflow from an explicitly allowed repository and branch.
5. Confirm the action receives a non-empty `version_id` and, for a new deploy, `job_id` without printing either JWT or Bumd token.
6. Repeat from a disallowed branch and expect 403.

Do not paste a real GitHub JWT into shell history or documentation. The exchange requires a live, short-lived signed token, so a fabricated example is not a meaningful manual verification.

## Production gaps

- Exchanged OIDC tokens are not currently given the intended 15-minute `expiresAt`; they remain valid until revoked.
- No exchange rate limit or durable OIDC audit record exists.
- Authorization mappings are environment JSON rather than tenant-owned database records.
- JWKS responses are fetched for each verification; `Cache-Control` caching and explicit key-rotation retry are not implemented.
- There is no dedicated OIDC Bearer guard; the exchange JWT is supplied in the JSON body.
- The action audience is fixed and not configurable through `action.yml`.
- Pull-request OIDC subjects are not supported by the current ref-only subject check.
- The repository has no production server/worker start scripts or dependency-aware `/health` and `/ready` endpoints.
- Root quality-gate documentation records that the full `pnpm test` run currently hangs during teardown; focused green tests must not be reported as full production readiness.

## Troubleshooting

- **401 `GitHub OIDC token is invalid`:** verify the audience, GitHub issuer, signing key availability, and runner clock.
- **403 organization not authorized:** parse `GITHUB_OIDC_AUTHORIZATIONS` as JSON and match `organizationSlug` exactly.
- **403 repository/ref/subject not authorized:** use the full `owner/repository` string and full ref such as `refs/heads/main`.
- **JWKS unavailable:** allow outbound HTTPS to `token.actions.githubusercontent.com`; do not permanently replace `GITHUB_OIDC_JWKS_URL` with an untrusted host.
- **Deploy stays queued:** verify `REDIS_URL` and worker bootstrap behavior. Without Redis, only the current process's in-memory processing path is available and is not durable.
