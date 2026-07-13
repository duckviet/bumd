# System Design

## Purpose

This document defines the core domain model, internal REST API contract, async deploy behavior, diff rules, webhook signing, and frontend structure for the OpenAPI documentation platform.

## Assumptions

- Public docs are anonymously readable. Private docs require organization membership or a scoped API token.
- Initial custom-domain support records domains and routing ownership, but automated certificate provisioning is not part of the bootstrap design.
- Billing and hard plan limits are not defined yet. Domain services expose quota-check boundaries so limits can be added later without rewriting deploy flow.
- The backend supports OpenAPI and AsyncAPI inputs. The first diff implementation is strongest for OpenAPI through `oasdiff`; AsyncAPI diff rules may start with structural validation and conservative change summaries.
- `main` is the default branch name for docs unless a deploy specifies another branch.

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

## Internal REST API Contract

All JSON endpoints return errors in this shape:

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

### Authentication

Browser/dashboard endpoints use Auth.js session JWTs.

Automation endpoints use:

```http
Authorization: Bearer bumd_live_xxx
```

The backend resolves API tokens by prefix, verifies the raw token with argon2, checks revocation/expiration, and updates `lastUsedAt` asynchronously.

### Organizations

`GET /v1/orgs`

Returns organizations visible to the authenticated user.

`POST /v1/orgs`

Creates an organization for an authenticated user and assigns the creator as owner.

### Docs

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

- `multipart/form-data` with `spec` file
- `application/json` with `specBase64`, `filename`, and optional `sourceFormat`

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

`GET /v1/orgs/{orgSlug}/docs/{docSlug}/branches/{branchSlug}/versions`

Lists versions for a branch.

`GET /v1/orgs/{orgSlug}/docs/{docSlug}/branches/{branchSlug}/versions/{versionId}`

Returns version metadata, validation status, render status, and related diff summary.

### Diffs

`GET /v1/orgs/{orgSlug}/docs/{docSlug}/branches/{branchSlug}/versions/{versionId}/diff`

Returns the diff against the previous ready version on the same branch.

`POST /v1/orgs/{orgSlug}/docs/{docSlug}/diffs/preview`

Accepts two uploaded specs or version references and returns an async diff preview job. This is used by GitHub Actions for PR comments when the head spec is not yet deployed.

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

Routes:

- `/docs/[orgSlug]/[docSlug]`
- `/docs/[orgSlug]/[docSlug]/[branchSlug]`
- `/docs/[orgSlug]/[docSlug]/[branchSlug]/[versionId]`
- `/docs/[orgSlug]/[docSlug]/[branchSlug]/[versionId]/[...operationSlug]`

Custom-domain routing resolves hostnames to docs before route handling.

Portal layout:

- left pane: navigation tree, branch/version selector;
- center pane: rendered operation/schema/content;
- right pane: table of contents, code samples, Try it out controls;
- top area: search, auth state, theme switch where applicable.

### Dashboard

Routes:

- `/app`
- `/app/[orgSlug]`
- `/app/[orgSlug]/docs`
- `/app/[orgSlug]/docs/[docSlug]`
- `/app/[orgSlug]/docs/[docSlug]/branches/[branchSlug]/versions/[versionId]`
- `/app/[orgSlug]/docs/[docSlug]/diffs/[diffId]`
- `/app/[orgSlug]/webhooks`
- `/app/[orgSlug]/api-tokens`
- `/app/[orgSlug]/settings`

## Feature-Sliced Frontend Structure

```text
apps/frontend/src/
  app/
    docs/
    app/
  pages/
    doc-portal/
    organization-dashboard/
  widgets/
    doc-navigation/
    version-switcher/
    search-box/
    try-it-out-panel/
    changelog-panel/
  features/
    deploy-spec/
    manage-webhooks/
    manage-api-tokens/
    compare-versions/
    customize-theme/
  entities/
    organization/
    doc/
    branch/
    version/
    diff/
    webhook/
    api-token/
  shared/
    api/
    auth/
    config/
    ui/
    lib/
```

Rules:

- Server Components fetch doc metadata, version data, and static render payloads by default.
- Client Components are reserved for search, Try it out, interactive code samples, menus, and forms.
- Entity models must not import features or widgets.
- Shared UI must not contain domain-specific deploy, diff, or webhook logic.

## Renderer Layer

The renderer wraps Stoplight Elements or Scalar behind a platform-owned adapter. The adapter is responsible for:

- stable three-pane layout integration;
- theme tokens;
- deep-link generation;
- operation IDs and slugs;
- code sample configuration;
- Try it out enablement and environment handling;
- search document extraction.

Renderer adapters must keep raw vendor-specific types out of application features where practical.
