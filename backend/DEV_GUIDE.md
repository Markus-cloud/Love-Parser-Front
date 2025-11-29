# Developer Guide

This guide explains how to work on the Love Parser backend, from local setup to coding conventions and Git hygiene.

## Local development setup

1. **Install toolchain**
   - Node.js 20 (use nvm or Volta).
   - [pnpm](https://pnpm.io) via `corepack enable pnpm`.
   - Docker Desktop / Colima if you want local PostgreSQL + Redis.

2. **Clone + install**
   ```bash
   git clone <repo>
   cd love-parser
   corepack enable pnpm
   pnpm install
   ```

3. **Environment variables**
   ```bash
   cd backend
   cp .env.example .env
   # set JWT_SECRET, SESSION_ENCRYPTION_KEY, Telegram + Robokassa secrets
   ```

4. **Datastores**
   - Start the compose stack: `docker compose up postgres redis` from `backend/`, or connect to your own services.
   - Run migrations: `pnpm --filter @love-parser/backend db:migrate`.

5. **Run the backend**
   ```bash
   pnpm --filter @love-parser/backend dev
   ```
   This single process serves HTTP, runs Bull workers, and schedules cron jobs. Logs stream to the console while being written to `logs/`.

6. **Full stack**
   - Run both apps concurrently: `pnpm dev` from the repo root (spawns frontend + backend).

## Running tests & quality checks

| Command | Description |
| --- | --- |
| `pnpm --filter @love-parser/backend test` | Vitest suites (unit + integration with `pg-mem`). |
| `pnpm --filter @love-parser/backend test:watch` | Watch mode. |
| `pnpm --filter @love-parser/backend test:coverage` | Coverage report. |
| `pnpm --filter @love-parser/backend build` | Type-check & emit `dist/` (tsc + tsc-alias). |

> The CI pipeline runs lint/format/test automatically, but you should run the relevant commands locally before opening a PR.

## Adding a new feature (checklist)

1. **Create a branch** named after the ticket (e.g., `feature/parsing-throttling`).
2. **Design first** – update `ARCHITECTURE.md` or `API_SPEC.md` if the contract or flows change.
3. **Update types + schemas together** – when adding request bodies, update the TypeScript types under `src/types` and the Zod schema under the corresponding route/middleware.
4. **Write/adjust migrations** when persistent data changes (`backend/migrations`). Keep them idempotent and reversible.
5. **Business logic lives in services** – routes should only validate and delegate to `src/services/*` to keep tests focused.
6. **Add tests** (Vitest). Target services and pure utilities; use Supertest for route-level coverage when behavior crosses layers.
7. **Respect quotas & auth** – ensure new endpoints run through `verifyJWT`, `getCurrentUser`, `assertActiveSubscription`, and `assert*Quota` helpers where relevant.
8. **Instrument & log** – leverage `logger`, Prometheus counters, or existing helper functions so observability stays consistent.
9. **Documentation** – update `README.md`, `DEPLOYMENT.md`, or `DEV_GUIDE.md` when behavior changes. Mention new env vars or flags.
10. **Self-review** before pushing: run tests, skim diff, ensure formatting matches the surrounding code.

## Code style & conventions

- **TypeScript**
  - Strict mode is enabled. Prefer explicit return types in exported helpers.
  - Keep imports path-based via the `@/...` aliases defined in `tsconfig.json`.
  - Use discriminated unions & literal types for enums (e.g., `type ActivityLevel = "low" | "medium" | "high"`).
- **Validation**
  - Use Zod schemas inside routes/middleware (`validateRequest`) so errors are normalized automatically.
  - Normalize input (trim strings, coerce numbers) before handing off to services.
- **Error handling**
  - Throw typed `AppError` subclasses (`AuthError`, `ValidationError`, `SubscriptionError`, etc.) so the global handler can map codes/status codes.
  - Never `console.log`; use the shared `logger`.
- **Services vs routes**
  - Routes should parse + authorize + call a service. Services handle DB/Redis access.
  - Cache invalidation (e.g., dashboard) belongs in the service.
- **Async queues**
  - Use `addJob(JobTypes.X, payload)` for long-running work. Persist job IDs in metadata if you need to reference them later.
  - Job handlers must update progress snapshots and handle retries gracefully.
- **Security**
  - Always pass `request.user?.id` through to services for per-user filtering.
  - Sanitize identifiers (UUIDs) before interpolating into SQL; rely on parameterized queries via `pg`.

## Git workflow

1. **Branching** – `feature/<ticket>`, `bugfix/<ticket>`, or `docs/<topic>` naming keeps CI filters simple.
2. **Commits** – keep them scoped and descriptive (present tense). Reference the ticket ID in the subject when applicable.
3. **Rebase often** – `git fetch origin && git rebase origin/main` before opening a PR to avoid merge commits.
4. **Pull Request checklist**
   - [ ] Tests pass locally (`pnpm --filter @love-parser/backend test`).
   - [ ] No lint/type errors from `pnpm --filter @love-parser/backend build`.
   - [ ] Documentation updated (API spec, deployment, architecture, dev guide, changelog if applicable).
   - [ ] Screenshots / curl examples attached when tweaking endpoints.
5. **Code review** – respond to comments promptly, amend commits if necessary, and keep the branch up-to-date.
6. **Release** – merges to `main` should be fast-forward or squash-merged according to repo policy. Tag releases after staging verification.

Following this workflow keeps the backend stable, observable, and easy to reason about.
