# Architecture

## Purpose

This platform turns OpenAPI and AsyncAPI specifications into immutable, auto-deployed documentation portals with change detection, search, webhook notifications, and pull request feedback.

The system is async-first: write-path API calls accept uploads quickly, persist durable intent, and enqueue parsing, validation, diffing, indexing, render-cache, and webhook work for background workers.

## Assumptions

- Public docs are anonymously readable. Private docs require an authenticated user session or a scoped API token.
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

### `apps/frontend`

Next.js 16 documentation portal and application UI. It owns:

- public and private doc portal routes;
- authenticated organization dashboard;
- branch/version selectors;
- search UI;
- theme and custom-domain presentation;
- diff/changelog views;
- integration with the doc renderer package.

The frontend follows Feature-Sliced Design with `app`, `pages`, `widgets`, `features`, `entities`, and `shared` boundaries.

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

- User sessions use Auth.js and JWT.
- CI and CLI authentication use API tokens stored only as argon2 hashes.
- Raw token values are shown once at creation time and never logged.
- Every API token is scoped to an organization and role/capability set.
- Private documentation reads require authenticated access.
- Webhook secrets are encrypted or otherwise protected at rest and are never logged.
- Webhook payloads include timestamped HMAC signatures to prevent tampering and replay.
- All service-to-service calls use private network paths and explicit timeouts.

## Tech Stack Rationale

- NestJS with Fastify provides structured modules, dependency injection, and high-throughput HTTP handling.
- Prisma gives typed database access and migration discipline for PostgreSQL.
- Next.js 16 supports a mixed public portal and authenticated dashboard with strong routing and server rendering.
- TailwindCSS enables themeable portal styling without coupling the renderer to one fixed brand.
- Feature-Sliced Design keeps frontend business concepts isolated as the app grows.
- Stoplight Elements or Scalar accelerates renderer capability while preserving a custom product layer for layout, theme, search, and version navigation.
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

