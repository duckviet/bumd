# Architecture

## Purpose

This platform turns OpenAPI and AsyncAPI specifications into immutable, auto-deployed documentation portals with change detection, search, webhook notifications, and pull request feedback.

The system is async-first: write-path API calls accept uploads quickly, persist durable intent, and enqueue parsing, validation, diffing, indexing, render-cache, and webhook work for background workers.

## Assumptions

- Public docs are anonymously readable. Private docs require an authenticated user session or a scoped API token.
- The canonical public portal route is currently `/:org/:doc`, with changelogs at `/:org/:doc/changes` and `/:org/:doc/changes/:diffId`. The older `/docs/...` route family is not implemented and is not canonical.
- Tenant isolation is enforced by `organizationId` on every tenant-owned record and by mandatory authorization checks in the application service layer.
- Custom domains are first-class, but initial TLS ownership is external unless later product decisions require automated certificate provisioning.
- Billing and plan quotas are out of scope for the bootstrap architecture. The model keeps enforcement hooks for future limits on docs, branches, deploys, custom domains, search indexing, and webhook volume.
- Versions are immutable once created. Any corrected spec, metadata, render artifact, or diff result is represented by a new version or a new derived processing record, never by mutating the original version payload.

## System Overview

```text
CLI / GitHub Action
        |
        v
Backend API (NestJS + Fastify)
        |
        | persist deploy request, version shell, object pointer
        v
PostgreSQL + Object Storage
        |
        | enqueue jobs
        v
Redis + BullMQ
        |
        +--> Spec Worker: parse, validate, normalize
        +--> Diff Worker: call oasdiff service, classify changes
        +--> Render Worker: prepare portal cache and renderer payloads
        +--> Search Worker: index operations/content in Meilisearch
        +--> Webhook Worker: deliver signed event payloads with retries
```

## Deploy Data Flow

1. An engineer runs the CLI or a GitHub Action with a spec file, target organization, doc, and branch.
2. The client computes or sends a SHA-256 hash. The backend recomputes the hash from the received bytes and treats the server-computed hash as authoritative.
3. The backend authenticates the request with a hashed API token, checks organization/doc/branch permissions, and stores the raw spec in object storage.
4. The backend starts a database transaction:
   - create or reuse the target branch;
   - check for an existing version with the same doc, branch, and SHA-256;
   - if unchanged, return the existing version with `skipped: true`;
   - otherwise create a new immutable version in `queued` status;
   - create a deploy job record and enqueue BullMQ work.
5. The deploy endpoint returns immediately with `202 Accepted` for new versions or `200 OK` for idempotent no-op deploys.
6. Workers process queued jobs:
   - parse and validate OpenAPI or AsyncAPI;
   - normalize extracted operation/channel metadata;
   - diff against the previous successful version on the same branch;
   - classify breaking and non-breaking changes;
   - generate changelog entries;
   - build render-cache payloads;
   - index searchable content;
   - emit webhook events.
7. Webhook delivery signs each event with HMAC, records every attempt, and retries transient failures with exponential backoff.
8. GitHub Action callers can request PR comments containing the diff summary and changelog.

## Component Boundaries

### `apps/backend`

NestJS API and worker application. It owns:

- authentication and authorization;
- tenant-aware domain services;
- deploy ingestion;
- BullMQ producers and processors;
- Prisma database access;
- object storage adapters;
- webhook signing and delivery orchestration;
- integration with diff-engine, Meilisearch, and renderer cache generation.

Backend modules should map to domain capabilities rather than technical layers: `AuthModule`, `OrganizationsModule`, `DocsModule`, `DeploysModule`, `VersionsModule`, `DiffsModule`, `WebhooksModule`, `SearchModule`, `StorageModule`, and `JobsModule`.

The backend is also the exclusive persistence and authorization boundary for the dashboard. The frontend does not connect to PostgreSQL. Dashboard authentication, organization membership, docs, API tokens, invites, webhooks, GitHub settings, and test workflows are served through backend-owned services. Auth.js remains a browser-facing session facade rather than a second identity or persistence store.

The implemented test-workflow domain lives under `TestWorkflowsModule`. It owns tenant-scoped workflow and environment CRUD, immutable run snapshots, BullMQ dispatch, phase-aware execution, assertions/exports, redaction, and run history. It reuses the Try-it-out executor so workflow requests inherit the declared-server, blocked-header, timeout, and SSRF controls.

### `apps/frontend`

Next.js 16 documentation portal and application UI. It owns:

- public and private doc portal routes;
- authenticated organization dashboard;
- branch/version selectors;
- search UI;
- theme and custom-domain presentation;
- diff/changelog views;
- integration with the doc renderer package.

The frontend follows a lite Feature-Sliced Design with `app`, `widgets`, `features`, `entities`, and `shared` boundaries. There is no separate source-level `pages` layer in the current implementation. Dependencies flow downward only:

- `app` wires routes, server actions, providers, and access checks;
- `widgets` compose visible page regions and own layout state for that region;
- `features` own user actions and interaction workflows such as search, deploy, invites, and Try it out;
- `entities` own normalized domain models and mappers for OpenAPI, docs, versions, organizations, diffs, and webhooks;
- `shared` owns generic UI primitives, non-domain utilities, config, and API clients.

Doc rendering is an integration surface, not a feature boundary. The current renderer is a platform-owned React implementation in `widgets/doc-renderer`, not a Stoplight Elements or Scalar adapter. It composes operation navigation, schema rail, rendered operation detail, search entry points, theme controls, and Try-it-out entry points. OpenAPI models live in `entities/openapi`; request-building lives in `features/try-it-out`; generic API clients and utilities live in `shared`. The renderer must not acquire persistence or backend domain responsibilities.

`features/try-it-out` owns the current modal workflow, while `widgets/try-it-out-panel` and its legacy panel remain in the tree. Consolidating the duplicate panel/modal paths is open boundary cleanup (`ARCH-FSD-005`); neither path should gain backend or persistence responsibilities meanwhile.

### `apps/cli`

oclif-based npm CLI. It owns:

- local config and token login/logout;
- spec file discovery;
- deploy command;
- local SHA-256 calculation for preflight display;
- structured output for CI;
- exit codes suitable for GitHub Actions.

The CLI is a thin client. Server-side auth, hashing, diffing, validation, and tenancy decisions remain authoritative.

### `packages/github-action`

Reusable GitHub Action wrapper around the CLI or backend API. It owns:

- action inputs;
- CI-friendly deploy execution;
- optional PR comment publishing;
- GitHub token usage for comments only.

### `packages/diff-engine`

Wrapper around the `oasdiff` Go binary exposed as an internal service or executable adapter. It owns:

- stable command invocation;
- timeout and resource limits;
- JSON result normalization;
- mapping raw diff output into platform change categories.

It must not own product policy. Product-level breaking/non-breaking classification lives in backend domain code so the rules are reviewable and testable in TypeScript.

## Storage Architecture

### PostgreSQL

PostgreSQL is the source of truth for organizations, docs, branches, version metadata, processing state, diffs, changelogs, API tokens, webhook endpoints, and delivery attempts.

All tenant-owned rows include `organizationId`. Unique constraints enforce idempotency, including a unique version identity for `(docId, branchId, sha256)`.

### Object Storage

S3, Cloudflare R2, or MinIO stores raw uploaded specs and generated renderer artifacts. Database rows store object keys, content hash, size, media type, and immutable references.

Raw specs are never overwritten. Generated artifacts are content-addressed where practical.

### Redis + BullMQ

Redis backs BullMQ queues. Job IDs must be deterministic for idempotent deploy processing, using version IDs and job type names. Workers must tolerate duplicate execution.

### Meilisearch

Meilisearch indexes rendered searchable content by doc, branch, and version. Private docs require search filters scoped to authorized tenant/doc access; public docs may expose anonymous search for published versions.

## Security Model

- Auth.js is the browser-session facade. The backend is authoritative for users, memberships, and refresh sessions.
- Backend dashboard access credentials expire after 15 minutes. Refresh credentials rotate against backend `DashboardSession` rows whose hashes are stored server-side and whose lifetime is 30 days. Credential material is retained inside the encrypted HttpOnly Auth.js JWT and must not be copied into browser-visible session JSON.
- CI and CLI authentication use API tokens stored only as argon2 hashes.
- Raw token values are shown once at creation time and never logged.
- Every API token is scoped to an organization and role/capability set.
- Private documentation reads require authenticated access.
- Webhook secrets are encrypted or otherwise protected at rest and are never logged.
- Outbound Bumd webhook payloads include timestamped HMAC signatures for integrity. Replay resistance depends on receivers enforcing timestamp freshness and event-ID deduplication; a signature alone does not prevent replay.
- All service-to-service calls use private network paths and explicit timeouts.

## GitHub Integration

The current implementation has four distinct GitHub paths:

- Browser GitHub sign-in is handled through Auth.js and the backend dashboard GitHub exchange. Backend user records may link a `githubId` and `githubLogin`; an unrecognized verified GitHub user currently receives a personal organization and owner membership. Subsequent dashboard authorization uses backend membership state.
- CLI GitHub login exchanges a GitHub access token at `POST /v1/auth/github/exchange` for a Bumd API token scoped to `docs:deploy`. It does not create an organization or membership.
- GitHub Actions OIDC exchanges a signed Actions JWT at `POST /v1/auth/github/oidc-token`. The verifier checks RS256/JWKS, issuer, audience, temporal claims, repository, owner, subject, and allowed ref. Authorization is currently configured by `GITHUB_OIDC_AUTHORIZATIONS`, not a persisted `GitHubOrgMapping` table.
- GitHub App installation, repository links, branch/spec mappings, signed webhooks, and push/PR intent are backend-owned under the GitHub module. The current GitHub queue is process-local and has no production consumer wired to `GithubWorker`; queued webhook work is therefore not yet a durable production worker path. The GitHub Action consumes the deploy/diff APIs and may use OIDC or a long-lived backend token.

Known production gaps remain: OIDC authorization is not database-managed; JWKS responses are not cached and key rotation has no focused test; OIDC tokens are not explicitly limited to the planned 15-minute lifetime, the exchange has no production rate limit or durable audit row, and CLI OAuth tokens are not explicitly limited to the planned one-hour lifetime. The OAuth exchange must also consistently verify the primary GitHub email even when `/user` includes an email. These are open hardening items, not completed capabilities.

GitHub App production gaps are tracked separately: `GH-APP-004` removes or authenticates the legacy organization mutation routes; `GH-APP-005` makes a missing webhook secret fail closed; `GH-APP-006` adds delivery-ID replay protection; and `GH-APP-007` replaces worker stubs and fixes organization/doc slug-versus-ID usage. The current webhook verifier accepts any signature when `GITHUB_WEBHOOK_SECRET` is absent, and it does not persist GitHub delivery IDs or reject replayed deliveries. The process-local queue also has no production consumer and remains open production work.

## Test Workflow Runtime

Saved workflow definitions are normalized to `schemaVersion: 2`. Existing version-1 definitions are read without rewriting the stored row and receive an empty `context.testData` plus `test` phases. Version 2 supports:

- workflow metadata: normalized tags, priority (`low | medium | high | critical`), and type (`smoke | integration | end_to_end | contract`);
- non-secret `context.testData` and exactly three interpolation namespaces: `env`, `data`, and ancestor-produced `vars`;
- endpoint nodes in `setup`, `test`, or `teardown` phases, with phase-regressing edges rejected;
- immutable definition, metadata, and encrypted environment snapshots when a run is queued;
- deterministic setup/test/teardown execution, descendant fail-fast behavior, teardown after failure or cancellation, and final precedence of canceled over setup/test failure over teardown-only failure over success;
- redacted request, response, input, assertion, and export records; only request and response bodies are currently size-bounded.

Runs are dispatched to the `test-workflow-runs` BullMQ queue with a deterministic colon-free job ID and one attempt. PostgreSQL remains the durable run/step source of truth. A reaper updates stale running `TestWorkflowRun` rows to failed rather than resuming side-effecting work.

Current gaps must remain visible: without `REDIS_URL`, dispatch logs a synchronous-background message but does not actually execute the queued run; workflow routes authenticate principals but do not consistently enforce the `docs:test` scope or role matrix; environment deletion is not fully scoped by doc and branch; pagination, rate limiting, reaper behavior, and 64 KiB truncation need stronger HTTP/runtime coverage. The controller-level slug resolution also still reaches service database pools and should move behind a service/repository boundary.

## Tech Stack Rationale

- NestJS with Fastify provides structured modules, dependency injection, and high-throughput HTTP handling.
- Prisma gives typed database access and migration discipline for PostgreSQL.
- Next.js 16 supports a mixed public portal and authenticated dashboard with strong routing and server rendering.
- TailwindCSS enables themeable portal styling without coupling the renderer to one fixed brand.
- Feature-Sliced Design keeps frontend business concepts isolated as the app grows.
- A custom React renderer preserves full control of the portal layout, operation navigation, theme, search, and Try-it-out integration without exposing vendor-specific renderer types.
- BullMQ and Redis are a pragmatic queue foundation for async deploy processing and webhook retries.
- Object storage keeps large specs and render artifacts out of the database.
- Meilisearch provides fast, typo-tolerant docs search with manageable operational complexity.
- `oasdiff` provides a proven OpenAPI diff core while the platform owns product classification and reporting.
- oclif is a mature CLI framework for npm distribution and GitHub Action reuse.

## Operational Guidelines

- Deploy API calls should complete without waiting for parse, diff, render, search, or webhook work.
- Workers must be horizontally scalable and idempotent.
- Processing status must be queryable by version ID.
- Failed processing should retain the immutable version record and expose error state without corrupting prior successful versions.
- Webhook delivery must never block deploy ingestion or portal rendering.
- Observability must include request IDs, job IDs, organization IDs, doc IDs, version IDs, and webhook event IDs, but never secrets or raw token values.
- The unauthenticated Try-it-out backend route currently verifies route ownership and declared targets but does not enforce private-doc visibility itself. Treat private-doc proxy authorization as an open security gap until the backend route checks membership or a scoped token.
- Search-document extraction belongs to the backend search pipeline (`search/openapi-search-extractor.ts`), not the frontend renderer.
