# System Design

## Purpose

This document defines the core domain model, internal REST API contract, async deploy behavior, diff rules, webhook signing, and frontend structure for the OpenAPI documentation platform.

## Assumptions

- Public docs are anonymously readable. Private docs require organization membership or a scoped API token.
- Initial custom-domain support records domains and routing ownership, but automated certificate provisioning is not part of the bootstrap design.
- Billing and hard plan limits are not defined yet. Domain services expose quota-check boundaries so limits can be added later without rewriting deploy flow.
- The backend supports OpenAPI and AsyncAPI inputs. The first diff implementation is strongest for OpenAPI through `oasdiff`; AsyncAPI diff rules may start with structural validation and conservative change summaries.
- `main` is the default branch name for docs unless a deploy specifies another branch.
- The implemented public portal route is `/:org/:doc`; changelog routes are `/:org/:doc/changes` and `/:org/:doc/changes/:diffId`. The previously proposed `/docs/...` family is obsolete unless a future migration explicitly reintroduces it.

## Core Domain Models

### Organization

Represents a tenant.

Fields:

- `id`
- `slug`
- `name`
- `createdAt`
- `updatedAt`

Relationships:

- has many docs
- has many memberships
- has many API tokens
- has many webhook endpoints

Rules:

- `slug` is globally unique.
- Every tenant-owned model must reference `organizationId` directly or through a required parent.

### Membership

Connects a user to an organization.

Fields:

- `id`
- `organizationId`
- `userId`
- `role`: `owner | admin | member | guest`
- `createdAt`
- `updatedAt`

Rules:

- `owner` can manage billing hooks, destructive org settings, all docs, API tokens, and webhook endpoints.
- `admin` can manage docs, branches, API tokens, and webhooks.
- `member` can deploy specs and view private docs.
- `guest` can view private docs but cannot deploy or mutate settings.

### Doc

Represents one documentation portal.

Fields:

- `id`
- `organizationId`
- `slug`
- `name`
- `visibility`: `public | private`
- `defaultBranchId`
- `themeConfig`
- `customDomain`
- `createdAt`
- `updatedAt`

Relationships:

- belongs to organization
- has many branches
- has many versions

Rules:

- `(organizationId, slug)` is unique.
- Visibility applies to portal reads and search reads.
- Theme changes do not mutate versions.

### Branch

Represents a named stream of versions for a doc.

Fields:

- `id`
- `organizationId`
- `docId`
- `name`
- `slug`
- `createdAt`
- `updatedAt`

Relationships:

- belongs to doc
- has many versions

Rules:

- `(docId, slug)` is unique.
- Branches are mutable metadata containers. Their versions are immutable.

### Version

Represents one immutable deployed spec.

Fields:

- `id`
- `organizationId`
- `docId`
- `branchId`
- `sequenceNumber`
- `sha256`
- `sourceFormat`: `openapi | asyncapi`
- `rawSpecObjectKey`
- `status`: `queued | processing | ready | failed`
- `validationSummary`
- `createdByUserId`
- `createdByTokenId`
- `createdAt`
- `readyAt`

Relationships:

- belongs to doc and branch
- has one diff from previous version
- has many processing jobs/events

Rules:

- Versions are immutable. No code may update raw spec bytes, SHA-256, source format, semantic extracted content, or identity fields after creation.
- Processing status may advance from `queued` to a terminal state. Derived normalized specs, render artifacts, diffs, and indexes are stored as separate version-addressed processing records or content-addressed objects, not by mutating version identity/source fields.
- `(docId, branchId, sha256)` is unique for deploy idempotency.
- `(branchId, sequenceNumber)` is unique for stable ordering.

### VersionArtifact

Represents derived processing output for one version.

Fields:

- `id`
- `organizationId`
- `versionId`
- `kind`: `normalized_spec | render_payload | search_document`
- `objectKey`
- `contentSha256`
- `createdAt`

Rules:

- Artifacts are append-only. Reprocessing creates a new artifact row or reuses an identical content-addressed object.
- Raw uploaded specs remain referenced only by the immutable version source fields.

### Diff

Represents comparison between two versions.

Fields:

- `id`
- `organizationId`
- `docId`
- `branchId`
- `baseVersionId`
- `headVersionId`
- `classification`: `none | non_breaking | breaking`
- `summary`
- `changes`
- `createdAt`

Rules:

- One diff exists per adjacent version comparison when a previous ready version exists.
- A diff is derived data. If classification logic changes, create a new diff revision or audit record rather than mutating historical meaning without trace.

### Webhook

Represents an outbound integration endpoint.

Fields:

- `id`
- `organizationId`
- `url`
- `description`
- `secretRef`
- `enabled`
- `eventTypes`
- `createdAt`
- `updatedAt`

Relationships:

- has many webhook delivery attempts

Rules:

- Secrets are never returned in API responses.
- Disabled webhooks do not receive new deliveries.

### WebhookDelivery

Represents one event delivery lifecycle.

Fields:

- `id`
- `organizationId`
- `webhookId`
- `eventId`
- `eventType`
- `payload`
- `status`: `queued | delivered | retrying | failed`
- `attemptCount`
- `lastStatusCode`
- `lastError`
- `nextAttemptAt`
- `createdAt`
- `updatedAt`

### ApiToken

Represents a CI/CLI credential.

Fields:

- `id`
- `organizationId`
- `name`
- `tokenHash`
- `tokenPrefix`
- `role`
- `scopes`
- `lastUsedAt`
- `expiresAt`
- `revokedAt`
- `createdAt`

Rules:

- Store only argon2 hashes and a short non-secret prefix for display.
- Raw tokens are shown exactly once.
- Tokens authenticate deploy and automation endpoints, not browser sessions.

### User And DashboardSession

`User` is the backend-owned browser identity. It stores email, name, a password hash, and optional `githubId`/`githubLogin` identity fields. `DashboardSession` stores a hashed rotating refresh credential, expiry, and revocation state for one user.

Rules:

- Backend access credentials expire after 15 minutes.
- Refresh sessions expire after 30 days and are checked and rotated against backend state.
- Auth.js retains the backend credentials only inside its encrypted HttpOnly JWT. Browser-visible session JSON contains public user data, not access or refresh secrets.
- Organization membership is resolved by the backend for each dashboard organization boundary.

### GitHub Integration Models

`GithubInstallation`, `GithubRepository`, and `GithubRepoBranchMapping` persist organization-owned GitHub App installation, repository, document, branch, and spec-path relationships. Dashboard GitHub mutations are backend-authorized. Push and pull-request webhook intent currently enters an in-memory, process-local queue; no production queue consumer invokes `GithubWorker`.

The Actions OIDC authorization allow-list is currently configuration-backed through `GITHUB_OIDC_AUTHORIZATIONS`. A persisted `GitHubOrgMapping` and a durable OIDC audit model are not implemented.

### TestWorkflow

Represents a private, branch-scoped API test graph.

Fields include:

- `organizationId`, `docId`, `branchId`;
- name, slug, description;
- normalized tags, priority (`low | medium | high | critical`), and type (`smoke | integration | end_to_end | contract`);
- versioned `definitionJson`;
- optimistic `revision` and soft-delete timestamp.

`(docId, branchId, slug)` is unique. All reads and mutations must also match organization, doc, and branch.

### TestEnvironment And TestEnvironmentVariable

An environment is private to an organization/doc/branch and contains named variables. Variable values are encrypted at rest. API responses return only id, key, `secret`, and `hasValue` descriptors. A default environment is unique by service behavior within a doc/branch.

### TestWorkflowRun And TestWorkflowStepRun

A run pins the newest ready version for its branch and stores immutable `definitionSnapshotJson`, `metadataSnapshotJson`, and, when selected, encrypted `environmentSnapshotJson`. A step stores its node, operation, phase, status, redacted request/response/input/assertion/export records, timestamps, duration, and typed error.

Run statuses are `queued | running | succeeded | failed | canceled`. Step statuses are `queued | running | succeeded | failed | skipped | canceled`.

## Internal REST API Contract

The target JSON error envelope is:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "requestId": "string",
    "details": {}
  }
}
```

Some current controllers still omit a stable request ID or use slice-specific codes. Repository-wide error-envelope and request-ID consistency remains open work.

### Authentication

Browser/dashboard endpoints use an Auth.js session facade backed by backend-issued dashboard credentials. The backend access credential lasts 15 minutes; the rotating hashed refresh session lasts 30 days. The backend, not the frontend, resolves users and memberships.

Automation endpoints use:

```http
Authorization: Bearer bumd_live_xxx
```

The backend resolves API tokens by prefix, verifies the raw token with argon2, checks revocation/expiration, and updates `lastUsedAt` asynchronously.

Dashboard authentication routes are backend-owned:

- `POST /v1/dashboard/auth/register`
- `POST /v1/dashboard/auth/login`
- `POST /v1/dashboard/auth/github`
- `POST /v1/dashboard/auth/refresh`
- `POST /v1/dashboard/auth/logout`
- `GET /v1/dashboard/me`
- `GET /v1/dashboard/orgs/{orgSlug}/membership`
- `POST /v1/dashboard/invites/accept`

The frontend has no PostgreSQL client or `DATABASE_URL` contract.

### Organizations

The following organization routes are the intended public contract, but `GET /v1/orgs` and `POST /v1/orgs` are not currently implemented as complete production routes.

`GET /v1/orgs`

Returns organizations visible to the authenticated user.

`POST /v1/orgs`

Creates an organization for an authenticated user and assigns the creator as owner.

### Docs

The complete implemented dashboard CRUD contract is currently under `/v1/dashboard/orgs/{orgSlug}/docs...`, including list/create/detail/update/delete, version detail/diff, and test-context reads. These routes use backend dashboard credentials and role checks.

The non-dashboard `/v1/orgs/{orgSlug}/docs...` surface below remains partial. Do not infer that every proposed list/create/branch endpoint exists merely because dashboard CRUD exists.

`GET /v1/orgs/{orgSlug}/docs`

Returns docs visible to the caller.

`POST /v1/orgs/{orgSlug}/docs`

Creates a doc.

Request:

```json
{
  "slug": "payments",
  "name": "Payments API",
  "visibility": "private"
}
```

Response:

```json
{
  "id": "doc_123",
  "slug": "payments",
  "name": "Payments API",
  "visibility": "private"
}
```

`GET /v1/orgs/{orgSlug}/docs/{docSlug}`

Returns doc metadata and default branch.

`PATCH /v1/orgs/{orgSlug}/docs/{docSlug}`

Updates mutable doc metadata: name, visibility, theme config, and custom-domain config.

### Branches

The explicit branch list/create routes below remain open. Deploy ingestion can create a missing deploy-target branch transactionally, and dashboard reads expose existing branch context, but that is not a replacement for the public branch-management contract.

`GET /v1/orgs/{orgSlug}/docs/{docSlug}/branches`

Lists branches.

`POST /v1/orgs/{orgSlug}/docs/{docSlug}/branches`

Creates a branch.

Request:

```json
{
  "name": "Main",
  "slug": "main"
}
```

### Deploys

`POST /v1/orgs/{orgSlug}/docs/{docSlug}/branches/{branchSlug}/deploys`

Accepts a spec upload and returns immediately.

Request content types:

- Implemented: `application/json` with `specBase64`, `filename`, and optional `sourceFormat`.
- Planned but not implemented: `multipart/form-data` with a `spec` file.

Request:

```json
{
  "filename": "openapi.yaml",
  "sourceFormat": "openapi",
  "specBase64": "..."
}
```

New-version response:

```json
{
  "skipped": false,
  "version": {
    "id": "ver_123",
    "sha256": "abc123",
    "status": "queued"
  },
  "job": {
    "id": "job_123",
    "status": "queued"
  }
}
```

Unchanged response:

```json
{
  "skipped": true,
  "version": {
    "id": "ver_122",
    "sha256": "abc123",
    "status": "ready"
  }
}
```

Status codes:

- `202 Accepted` for a new queued version
- `200 OK` for idempotent unchanged deploy
- `400 Bad Request` for malformed upload metadata
- `401 Unauthorized` for missing/invalid auth
- `403 Forbidden` for insufficient role or scope
- `404 Not Found` for inaccessible org/doc/branch
- `413 Payload Too Large` for oversized specs

### Versions

The nested public version list contract below is not complete. Current catalog reads cover latest-ready, version detail, and version diff; dashboard routes cover the implemented version-history UI.

`GET /v1/orgs/{orgSlug}/docs/{docSlug}/branches/{branchSlug}/versions`

Lists versions for a branch.

`GET /v1/orgs/{orgSlug}/docs/{docSlug}/branches/{branchSlug}/versions/{versionId}`

Returns version metadata, validation status, render status, and related diff summary.

### Diffs

`GET /v1/orgs/{orgSlug}/docs/{docSlug}/branches/{branchSlug}/versions/{versionId}/diff`

Returns the diff against the previous ready version on the same branch.

`POST /v1/orgs/{orgSlug}/docs/{docSlug}/diffs/preview`

Accepts two uploaded specs or version references and returns an async diff preview job. This is used by GitHub Actions for PR comments when the head spec is not yet deployed.

Current implementation gap: this endpoint returns a fixed `none` placeholder and does not yet perform the documented comparison.

### Webhooks

`GET /v1/orgs/{orgSlug}/webhooks`

Lists webhook endpoints.

`POST /v1/orgs/{orgSlug}/webhooks`

Creates a webhook endpoint.

Request:

```json
{
  "url": "https://example.com/webhooks/bumd",
  "description": "Deploy notifications",
  "eventTypes": ["version.created", "diff.breaking_detected"]
}
```

`PATCH /v1/orgs/{orgSlug}/webhooks/{webhookId}`

Updates URL, description, enabled state, or event type subscriptions.

`POST /v1/orgs/{orgSlug}/webhooks/{webhookId}/rotate-secret`

Rotates a webhook secret and returns the new secret once.

### API Tokens

The production dashboard list/create/revoke flow is implemented under `/v1/dashboard/orgs/{orgSlug}/api-tokens...`. On the non-dashboard route family, token creation exists at `POST /v1/orgs/{orgSlug}/api-tokens`; the proposed list/delete contract below is not complete.

`GET /v1/orgs/{orgSlug}/api-tokens`

Lists token metadata without hashes or raw values.

`POST /v1/orgs/{orgSlug}/api-tokens`

Creates a token.

Request:

```json
{
  "name": "production-ci",
  "role": "member",
  "scopes": ["docs:deploy"],
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

Response:

```json
{
  "id": "tok_123",
  "token": "bumd_live_secret_value_shown_once",
  "tokenPrefix": "bumd_live_abcd",
  "name": "production-ci",
  "scopes": ["docs:deploy"]
}
```

`DELETE /v1/orgs/{orgSlug}/api-tokens/{tokenId}`

Revokes a token.

### GitHub Authentication And App APIs

`POST /v1/auth/github/exchange` accepts a GitHub access token plus organization slug and, for an existing organization member, returns a one-time Bumd API token scoped to `docs:deploy`. It does not create organizations or memberships. The planned one-hour token expiry is not currently applied, and primary verified-email enforcement remains incomplete when GitHub's `/user` response already contains an email.

`POST /v1/auth/github/oidc-token` accepts a GitHub Actions JWT, organization slug, repository, and optional ref. The verifier checks GitHub issuer, configured audience (`GITHUB_OIDC_AUDIENCE`, default `bumd`), RS256 signature using GitHub JWKS, `exp`/`nbf`/recent `iat`, repository owner, repository, subject, and an allowed ref. Tenant authorization is read from `GITHUB_OIDC_AUTHORIZATIONS`.

The OIDC exchange currently lacks JWKS caching/key-rotation coverage, a persisted organization mapping, a durable audit record, rate limiting, and the planned explicit 15-minute API-token expiry.

GitHub App routes include organization-scoped installations, repositories, and branch/spec mappings under `/v1/orgs/{orgSlug}/github/...`; these legacy routes currently lack an authentication guard, including repository and mapping mutations. Guarded dashboard equivalents live under `/v1/dashboard/orgs/{orgSlug}/github/...`. GitHub webhooks enter through `POST /v1/github/webhooks`. Development push simulation is backend-only and blocked in production.

The GitHub App path is not production-complete:

- `GH-APP-004`: remove or authenticate the legacy `/v1/orgs/{orgSlug}/github/...` mutation routes.
- `GH-APP-005`: fail closed when `GITHUB_WEBHOOK_SECRET` is absent; the current verifier returns true with no configured secret.
- `GH-APP-006`: add replay protection backed by GitHub delivery-ID deduplication; no delivery-ID store currently rejects duplicate webhook delivery.
- `GH-APP-007`: replace stubbed GitHub fetch/deploy behavior and stop passing persisted `organizationId`/`docId` values into deploy-store parameters named `orgSlug`/`docSlug`.

The process-local `InMemoryGithubQueue` also has no production consumer wired to the injectable worker and remains open production work.

### Test Workflows

Base scope:

```text
/v1/orgs/{orgSlug}/docs/{docSlug}/branches/{branchSlug}
```

Workflow routes:

- `GET /test-workflows?cursor=&limit=`
- `POST /test-workflows`
- `GET /test-workflows/{workflowId}`
- `PATCH /test-workflows/{workflowId}` with `expectedRevision`
- `DELETE /test-workflows/{workflowId}` (soft delete)

Environment routes:

- `GET /test-environments`
- `POST /test-environments`
- `PATCH /test-environments/{environmentId}`
- `DELETE /test-environments/{environmentId}`

Run routes:

- `POST /test-workflows/{workflowId}/runs` returns `202` with a queued run id;
- `GET /test-workflows/{workflowId}/runs?cursor=&limit=`;
- `GET /test-workflows/{workflowId}/runs/{runId}`;
- `POST /test-workflows/{workflowId}/runs/{runId}/cancel` returns `202` for a non-terminal run and `409` for a terminal run.

Creation and update bodies are schema-parsed. Workflow updates use optimistic revisions and return `WORKFLOW_CONFLICT` on stale state. Workflow and run lists implement cursor-shaped responses, although malformed pagination and boundary behavior require stronger tests.

Authorization is not yet at the intended final state: the routes accept dashboard or API-token principals, but `docs:test` scope and the complete role matrix are not consistently enforced. Environment deletion also needs doc/branch scoping in addition to organization scoping. These are open security items.

## Test Workflow Definition Version 2

New and normalized definitions have this root shape:

```ts
type TestWorkflowDefinition = {
  schemaVersion: 2;
  context: { testData: Record<string, JsonValue> };
  nodes: TestWorkflowNode[];
  edges: TestWorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
};
```

Version-1 rows remain readable and are normalized in memory without rewriting storage: context defaults to `{ testData: {} }` and nodes default to phase `test`. Unknown version-2 fields are rejected rather than silently discarded.

Endpoint nodes contain operation identity, method/path/label, position, phase (`setup | test | teardown`), request template, exports, and assertions. The graph must be a DAG. Phase flow may remain within a phase or move forward; `test -> setup` and `teardown -> setup/test` edges are invalid.

Templates support exactly:

- `{{env.KEY}}` for encrypted environment values;
- `{{data.KEY}}` for saved non-secret test data;
- `{{vars.NAME}}` for exports from ancestor nodes.

A pure template preserves its JSON type. Embedded templates accept scalar values only. Export names are globally unique, and `vars` references must come from ancestors.

Supported assertions cover status, JSON path, header, and response time. Exports may read status, a response header, or a response-body path. Arbitrary scripts, `eval`, schema-contract assertions, multipart bodies, retries, scheduled runs, parallel execution, CI generation, and import/export are not part of the implemented workflow runtime.

## Test Workflow Run Lifecycle

Run creation resolves and pins the newest ready version, validates operations/environment/template references, snapshots the normalized definition and metadata, snapshots selected encrypted environment values, creates queued step rows, and enqueues one job.

The worker uses a single validated topological order:

1. run all setup nodes;
2. run test nodes, skipping descendants of a failed test while independent branches may continue;
3. attempt teardown nodes after success, setup/test failure, or cancellation.

Final precedence is `canceled` over setup/test failure over teardown-only failure over success. A teardown-only failure uses `TEARDOWN_FAILED`; cleanup must not replace a primary setup/test error. New runs use the immutable environment snapshot; legacy runs with no snapshot may fall back to the live environment.

Jobs use queue `test-workflow-runs`, deterministic job id `test-workflow-{runId}`, and `attempts: 1`. PostgreSQL is authoritative for run and step state. Terminal steps are not re-executed. A periodic reaper updates stale running `TestWorkflowRun` rows to failed with `WORKER_INTERRUPTED`; it does not resume side-effecting work.

Secret substitutions and sensitive headers are redacted from stored request, response, input, assertion, export, and error data. Only request and response bodies pass through the current 64 KiB truncation helper. Inputs, assertions, and exports are redacted but otherwise unbounded; bounding them remains open work. API run detail exposes sanitized metadata, an environment descriptor, step phase, and redacted inputs.

Operational gaps: without `REDIS_URL`, the dispatcher currently returns without executing despite logging a synchronous-background fallback; run throttling is process-local and does not set the planned `Retry-After`; durable audit storage is absent; and reaper, pagination, rate-limit, and truncation behavior need additional production-facing tests.

## Async Deploy Flow

Deploy processing is a state machine:

```text
received -> queued -> processing -> ready
                         |
                         v
                       failed
```

Detailed flow:

1. Validate auth, authorization, upload envelope, and size limits.
2. Recompute SHA-256 from received bytes.
3. Look up existing version by `(docId, branchId, sha256)`.
4. If found, return it without enqueueing duplicate heavy work.
5. Store raw spec bytes in object storage using a content-addressed key.
6. Create version in `queued` status.
7. Enqueue deterministic BullMQ jobs:
   - `version-{versionId}-parse`
   - `version-{versionId}-diff`
   - `version-{versionId}-render`
   - `version-{versionId}-search`
   - `version-{versionId}-webhooks`

   Durable PostgreSQL `jobKey` values may retain the colon-delimited semantic form. BullMQ custom `jobId` values must use the colon-free form above because BullMQ rejects custom IDs containing `:`.

8. Workers acquire jobs independently and must be safe to retry.
9. A failed parse or validation marks the version `failed`, records a validation summary, and emits failure webhooks if subscribed.
10. A ready version becomes eligible as the base for the next branch diff.

## Diff Classification Rules

### Breaking Changes

For OpenAPI, classify as breaking when a change can break an existing client or documented contract:

- remove a path;
- remove an operation;
- remove or rename an operation parameter;
- add a new required request parameter;
- add a new required request body field;
- remove a request body media type;
- remove a response status code that was previously documented;
- remove a response media type;
- remove or narrow enum values accepted by requests;
- change request schema type to a narrower incompatible type;
- change response schema by removing a field that clients may consume;
- change authentication requirements to be stricter;
- remove server URLs or alter base paths incompatibly;
- introduce validation constraints that reject previously valid requests.

### Non-Breaking Changes

Classify as non-breaking when the change expands or clarifies the contract:

- add a new path;
- add a new operation;
- add an optional parameter;
- add an optional request body field;
- add response examples or descriptions;
- add response fields;
- add enum values to responses;
- loosen validation constraints;
- add tags, summaries, markdown, or external docs;
- add a new response status code without removing existing documented responses.

### No Functional Change

Classify as no functional change when only formatting, ordering, or semantically equivalent metadata changes occur after normalization.

### Unknown or Ambiguous Changes

If the diff engine cannot classify a change confidently, mark the item as `unknown` and do not count it as breaking unless the rule set explicitly says to fail closed for that field. PR comments must surface unknown changes separately.

## Changelog Generation

Each diff produces a changelog grouped by:

- Breaking changes
- Added operations
- Changed operations
- Removed operations
- Documentation-only changes
- Unknown changes

Entries should deep-link to the affected operation, schema, channel, or path when possible.

## Webhook Events

Initial event types:

- `version.created`
- `version.failed`
- `diff.breaking_detected`

Additional event types require an explicit product decision and an update to this document.

Payload:

```json
{
  "id": "evt_123",
  "type": "version.created",
  "createdAt": "2026-06-04T00:00:00.000Z",
  "organization": {
    "id": "org_123",
    "slug": "acme"
  },
  "doc": {
    "id": "doc_123",
    "slug": "payments"
  },
  "branch": {
    "id": "br_123",
    "slug": "main"
  },
  "version": {
    "id": "ver_123",
    "sha256": "abc123",
    "status": "queued"
  },
  "data": {}
}
```

Headers:

```http
Bumd-Event-Id: evt_123
Bumd-Event-Type: version.created
Bumd-Signature-Timestamp: 1780590000
Bumd-Signature: v1=hex_hmac_sha256
```

Signature base string:

```text
{timestamp}.{rawBody}
```

HMAC:

```text
hex(hmac_sha256(webhookSecret, signatureBaseString))
```

Receivers should reject payloads with stale timestamps, unknown event IDs, or invalid signatures.

Retry policy:

- Retry network errors, timeouts, and `5xx`.
- Do not retry `2xx`.
- Do not retry most `4xx`, except `408`, `409`, and `429`.
- Use exponential backoff with jitter.
- Stop after a bounded maximum attempt count and mark delivery failed.

## Frontend Routes

### Public and Private Portal

Implemented routes:

- `/[org]/[doc]` for the default branch's latest ready version;
- `/[org]/[doc]/changes`;
- `/[org]/[doc]/changes/[id]`.

The older `/docs/[orgSlug]/[docSlug]...` family is not implemented. Branch-selectable and immutable-version-selectable public portal routes remain open product work.

Custom-domain values can be stored as mutable doc metadata, but hostname-to-doc request routing is not implemented yet. Automated certificate provisioning also remains out of scope.

Portal layout:

- left pane: operation/tag navigation;
- center pane: rendered operation/schema/content;
- right pane: schema rail and operation context;
- top area: search and theme controls, with Try-it-out launched from operation detail.

Branch/version selectors and expanded code-sample controls remain open portal work.

### Dashboard

Implemented routes:

- `/app`
- `/app/[org]`
- `/app/[org]/docs`
- `/app/[org]/docs/[doc]`
- `/app/[org]/docs/[doc]/versions`
- `/app/[org]/docs/[doc]/versions/[versionId]`
- `/app/[org]/docs/[doc]/versions/[versionId]/diff`
- `/app/[org]/docs/[doc]/tests`
- `/app/[org]/docs/[doc]/tests/[workflowId]`
- `/app/[org]/members`
- `/app/[org]/webhooks`
- `/app/[org]/api-tokens`

There is no standalone implemented `/app/[org]/settings` route. Doc settings mutations are handled from the doc dashboard route.

## Feature-Sliced Frontend Structure

```text
apps/frontend/src/
  app/
    app/
  widgets/
    doc-renderer/
    search-box/
    changelog/
    test-workflow-canvas/
    try-it-out-panel/
  features/
    try-it-out/
    test-workflow-editor/
    test-workflow-run/
  entities/
    dashboard/
    openapi/
    test-workflow/
  shared/
    api/
    auth/
    config/
    ui/
```

Rules:

- Server Components fetch doc metadata, version data, and static render payloads by default.
- Client Components are reserved for search, Try it out, menus, forms, and other implemented interactions.
- Entity models must not import features or widgets.
- Shared UI must not contain domain-specific deploy, diff, or webhook logic.
- The frontend has no database adapter. Server components and route handlers call typed backend clients.
- `features/try-it-out` contains the current modal workflow, while `widgets/try-it-out-panel` retains a legacy panel path. Consolidation is open as `ARCH-FSD-005`; the duplicate paths are not a second domain boundary.

## Renderer Layer

The renderer is currently a custom React implementation under `widgets/doc-renderer`; Stoplight Elements and Scalar are not installed renderer dependencies. The platform-owned renderer is responsible for:

- stable three-pane layout integration;
- theme tokens;
- deep-link generation;
- operation IDs and slugs;
- Try it out enablement and environment handling;

Search-document extraction is backend-owned by `apps/backend/src/search/openapi-search-extractor.ts`; the frontend renderer consumes scoped search results and does not build the search index.

OpenAPI domain types and parsing stay in `entities/openapi`. Try-it-out request state and execution UI stay in `features/try-it-out`; search composition stays in its widget/client boundary. The renderer widget must not own persistence, API authorization, or reusable request-building workflows.

The Try-it-out backend validates version route ownership, declared server origins, blocked headers, internal hosts, timeouts, and redirects. Its route is currently unauthenticated and does not independently enforce private-doc visibility, so private-doc Try-it-out authorization remains an open security gap.
