# Agent Instructions

These rules govern the entire repository. Future nested `AGENTS.md` files may add stricter directory-specific rules for their subtrees.

Before changing code or documentation, read:

- `ARCHITECTURE.md` for system boundaries, deploy flow, storage choices, and stack rationale.
- `SYSTEM_DESIGN.md` for domain models, REST API contracts, async deploy behavior, diff rules, webhook signing, and frontend structure.

## Non-Negotiable Principles

- Versions are immutable. Never mutate a version's raw spec, SHA-256, source format, semantic extracted content, or identity fields after creation.
- Preserve tenant isolation. Every organization-owned query must be scoped by organization membership, API-token organization, or a validated public-doc read path.
- Treat deploys as async. API handlers must not perform heavy parse, validate, diff, render, search, or webhook delivery work inline.
- Keep generated and uploaded artifacts content-addressed or version-addressed. Never overwrite raw uploaded specs.
- Secrets must never be logged, committed, displayed in test snapshots, or returned after initial creation.
- Prefer small, typed, test-covered changes that respect the existing module boundary.

## TypeScript Rules

- Use strict TypeScript. Do not weaken compiler settings.
- Do not use `any`, `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Prefer discriminated unions for state machines such as version status, job status, webhook delivery status, and diff classification.
- Parse external inputs at boundaries with explicit schemas or DTO validation.
- Do not pass unvalidated request bodies into domain services.
- Prefer `unknown` over `any` at boundaries, then narrow deliberately.
- Keep functions focused and named by domain behavior.
- Use exhaustive checks for switch statements over domain enums/unions.

## File Naming

- TypeScript source files use kebab-case: `deploy-service.ts`, `webhook-signature.ts`.
- NestJS files follow framework suffixes: `.module.ts`, `.controller.ts`, `.service.ts`, `.processor.ts`, `.repository.ts`, `.dto.ts`.
- React components use PascalCase filenames only when the project convention for that slice requires it; otherwise prefer kebab-case directories with `index.ts` public exports.
- Tests mirror the file under test and use `.spec.ts` or `.test.ts` according to the package-local convention.
- Documentation files at the root use uppercase names when they are repo-wide: `ARCHITECTURE.md`, `SYSTEM_DESIGN.md`, `AGENTS.md`.

## Error Handling

- Use typed domain errors for expected failures: unauthorized access, forbidden access, missing doc, invalid deploy, duplicate resource, validation failure, and webhook delivery failure.
- Map domain errors to consistent REST error responses with stable `error.code` values.
- Do not leak internal exception messages, SQL errors, object-storage keys, token hashes, raw tokens, webhook secrets, or provider credentials to clients.
- Include request IDs and job IDs in logs and error responses where appropriate.
- Worker failures must be recorded on the related job/version/delivery record and must be safe to retry.

## Secret Handling

- Never commit `.env` files with real values.
- Never log raw API tokens, Auth.js secrets, JWTs, webhook secrets, object-storage credentials, Redis URLs with passwords, database URLs with passwords, or GitHub tokens.
- API tokens must be stored only as argon2 hashes plus non-secret prefixes.
- Webhook secrets must be stored through an approved secret-storage or encrypted-at-rest mechanism.
- Test fixtures must use obvious fake values such as `test_token_not_secret`.

## NestJS Backend Rules

- Organize code by domain modules, not by generic technical folders.
- Controllers handle transport concerns only: auth decorators, DTO parsing, status codes, and response mapping.
- Services own domain behavior and transactions.
- Prisma access must be isolated behind services or repositories; do not scatter raw Prisma calls across controllers.
- Use dependency injection for storage, search, queue, webhook, and diff-engine adapters.
- Do not instantiate external clients directly inside handlers.
- Keep BullMQ processors thin. Processors should load job context, call domain services, and record outcomes.
- Every tenant-owned mutation must verify role/scope before writing.

## Prisma Rules

- Migrations are append-only once shared. Do not edit an applied migration; create a new migration.
- Model tenant ownership explicitly with `organizationId` where the data is organization-scoped.
- Add database constraints for invariants that must survive concurrency, especially unique slugs and `(docId, branchId, sha256)` version idempotency.
- Use transactions for deploy creation, sequence allocation, and enqueue-intent persistence.
- Do not use destructive schema commands against shared databases.
- Never store raw token values or webhook secrets in plain model fields.

## Next.js Frontend Rules

- Default to Server Components for data fetching and static portal rendering.
- Use Client Components only for interactivity: search, Try it out, menus, forms, toggles, and live previews.
- Keep Feature-Sliced Design boundaries:
  - `app` wires routes and providers;
  - `pages` composes route-level screens;
  - `widgets` compose reusable page regions;
  - `features` implement user actions;
  - `entities` model domain concepts;
  - `shared` contains generic UI, config, API clients, and utilities.
- Entities must not import features, widgets, or pages.
- Shared UI must not depend on organization, doc, version, diff, or webhook domain services.
- Protect private doc routes on the server before rendering sensitive content.

## BullMQ Job Rules

- Job IDs must be deterministic for idempotent work, usually `version:{versionId}:{jobType}` or `webhook:{eventId}:{webhookId}`.
- Job handlers must tolerate duplicate execution.
- Jobs must record progress and terminal status in PostgreSQL.
- Do not rely on Redis as the only durable source of deploy state.
- Use bounded retries with backoff and jitter for transient external failures.
- Never let webhook delivery, search indexing, or render-cache generation block deploy ingestion.

## Diff Engine Rules

- Treat `oasdiff` as a diff primitive, not as the product policy layer.
- Normalize diff-engine output before storing or exposing it.
- Keep breaking/non-breaking classification rules aligned with `SYSTEM_DESIGN.md`.
- Unknown changes must be surfaced explicitly and must not be silently downgraded.

## CLI and GitHub Action Rules

- The CLI and GitHub Action are thin clients. They may compute hashes for display/preflight, but the backend recomputes hashes authoritatively.
- Use clear exit codes for CI.
- Do not print raw tokens in normal command output.
- PR comments should summarize breaking changes first, then non-breaking changes, then unknown changes.

## Required Commands

Run the package-local equivalents before handing off changes:

```bash
pnpm lint
pnpm test
pnpm build
```

For backend changes, also run the relevant Prisma validation/migration checks once scripts exist.

For frontend changes, also run type checking and any route/component tests once scripts exist.

For CLI changes, run command-level tests and at least one local dry-run-style invocation that does not expose secrets.

If the repository is still documentation-only and these commands do not exist, state that explicitly in the final response.

## Monorepo Directory Rules

Expected structure:

```text
apps/
  backend/
  frontend/
  cli/
packages/
  github-action/
  diff-engine/
```

Rules:

- `apps/backend` owns API, workers, Prisma access, auth, queues, storage adapters, search indexing, and webhook delivery.
- `apps/frontend` owns the dashboard and documentation portal UI.
- `apps/cli` owns the oclif CLI.
- `packages/github-action` owns GitHub Action packaging and PR comment integration.
- `packages/diff-engine` owns the wrapper around the Go `oasdiff` binary.
- Shared packages may be added only when two or more apps need the same typed contract or utility.

## DO NOT

- Do not mutate immutable version source data.
- Do not perform heavy deploy processing in request handlers.
- Do not bypass authorization because a route is "internal".
- Do not log, snapshot, commit, or return secrets.
- Do not store API tokens in plaintext.
- Do not overwrite raw spec objects in storage.
- Do not create a new version when the server-computed SHA-256 already exists for the same doc and branch.
- Do not make product policy decisions inside the `oasdiff` wrapper.
- Do not weaken TypeScript strictness, lint rules, or tests to pass a build.
- Do not introduce source files without matching tests once application code exists.
- Do not add features outside `ARCHITECTURE.md` and `SYSTEM_DESIGN.md` without documenting the assumption and product decision.

