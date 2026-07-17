# CLI authentication

The current CLI can bootstrap a Bumd API token through GitHub's OAuth device flow. The backend only issues a token when the GitHub identity matches a user who is already a member of the requested Bumd organization; it does not create an organization for CLI users.

## Prerequisites

1. Enable **Device Flow** in the GitHub OAuth App settings.
2. Build the CLI with `pnpm --filter @bumd/cli build`.
3. Run the backend against PostgreSQL and apply migrations.
4. Ensure the user has accepted an invite or otherwise has membership in the target organization.
5. Provide the public OAuth App client ID through `GITHUB_OAUTH_CLIENT_ID` or `--client-id`. Do not put a client secret in the CLI.

The backend endpoint is `POST /v1/auth/github/exchange`. The CLI first polls GitHub for an access token, then submits that access token and the requested organization slug to Bumd. The backend calls GitHub `/user`; it calls `/user/emails` only when `/user.email` is null. It then links the identity to an existing member and returns a `docs:deploy` API token. The conditional email verification behavior is a current security gap described below.

## Commands

The checked build exposes colon-delimited oclif command IDs:

```bash
GITHUB_OAUTH_CLIENT_ID=test_oauth_client_id_not_secret \
  node apps/cli/dist/index.js auth:login \
  --api-url http://127.0.0.1:3100 \
  --org acme

node apps/cli/dist/index.js auth:status --json
node apps/cli/dist/index.js auth:logout
```

The root `auth` topic currently displays subcommands but `auth login` is not the observable command form in the built CLI. Use `auth:login` until command discovery is changed.

The login command prints the GitHub verification URL and a short-lived user code. Treat the code as sensitive while authorization is pending. It must never print either the GitHub access token or the issued Bumd token.

## Stored credentials and precedence

The CLI stores one auth record in `${BUMD_CONFIG_HOME:-~/.config/bumd}/auth.json`, creates the directory with mode `0700`, and writes the file with mode `0600`. The record contains the API URL, organization slug, raw Bumd token, and non-secret token prefix.

Deploy authentication precedence is currently:

1. `BUMD_API_TOKEN`
2. the single token in `auth.json`

There is no deploy `--token` flag, no OS keychain integration, and no per-organization token map. Confirm `auth:status` matches the intended API URL and organization before deploying. Project context has a separate precedence of flags, `BUMD_API_URL`/`BUMD_ORG`/`BUMD_DOC`/`BUMD_BRANCH`, then `.bumd.json`.

## Current gaps

- `--gh-token` and `gh auth token` integration are not implemented. Do not pass a GitHub token through an undocumented flag.
- CLI OAuth tokens are not currently issued with the intended one-hour expiry, and there is no refresh flow.
- There are no command-level tests for login/logout/status in the current CLI package test script.
- The backend CLI exchange path may accept the email returned directly by GitHub `/user` without separately proving that address is verified. This requires hardening before relying on email linking in a production threat model.
- `auth.json` stores the raw Bumd token on disk. Use restrictive host permissions and a dedicated development credential until keychain support exists.

## Troubleshooting

- **Missing client ID:** pass `--client-id` or set `GITHUB_OAUTH_CLIENT_ID`.
- **Device authorization fails immediately:** verify Device Flow is enabled on the OAuth App and its client ID is correct.
- **403 from Bumd:** ensure the verified GitHub email or linked GitHub ID belongs to a user with membership in `--org`.
- **CLI targets port 3001:** `auth:login` defaults to `http://localhost:3001`, while the repository manual server defaults to port 3100. Pass `--api-url http://127.0.0.1:3100` locally.
- **Wrong organization after login:** run `auth:status`, then `auth:logout` and log in again for the intended organization.
