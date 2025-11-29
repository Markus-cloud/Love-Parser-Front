# Love Parser Backend

Fastify + TypeScript service that powers the Telegram parsing engine, audience segmentation logic, paid subscriptions, and async job processing for Love Parser. The backend exposes a REST API, streams parsing progress over SSE, interacts with Telegram and Robokassa, and manages PostgreSQL/Redis state.

## Feature highlights

- **Telegram-native auth** – phone based onboarding with two-factor support, encrypted session storage, and JWT issuance.
- **Channel parsing pipeline** – async search jobs, progress tracking over Server-Sent Events, CSV exports, and per-plan usage quotas.
- **Audience segmentation** – derive sub-segments from parsing results, filter by engagement/subscriber metrics, and preview recipients.
- **Subscription & billing** – Robokassa payment links, webhook handling, usage limit application, and dashboard invalidation.
- **Observability & safety** – Redis-backed rate limiting, structured logging, Prometheus metrics, health checks, and Bull job telemetry.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Runtime | Node.js 20, TypeScript (strict mode) |
| HTTP API | Fastify 4, Zod validation, @fastify/jwt, helmet, cors |
| Data | PostgreSQL via pg/knex, Redis 7 connection pool |
| Async | Bull queues + workers, cron scheduler, background job handlers |
| Integrations | Telegram Client API, Robokassa payments |
| Observability | Winston + rotating files, Prometheus metrics (`/metrics`), health probes |
| Testing | Vitest, Supertest, pg-mem |

## Quick start (local)

1. Install dependencies from the monorepo root: `corepack enable pnpm && pnpm install`.
2. Copy environment defaults: `cd backend && cp .env.example .env` and adjust secrets (Telegram, Robokassa, JWT, etc.).
3. Start PostgreSQL + Redis via Docker if needed: `docker compose up` (from `backend/`).
4. Run migrations: `pnpm --filter @love-parser/backend db:migrate`.
5. Launch the dev server + workers: `pnpm --filter @love-parser/backend dev` (hot reload via `tsx`).

The entrypoint (`src/index.ts`) boots Fastify, connects to PostgreSQL/Redis, starts Bull workers, and schedules cron jobs inside one process. Make sure Redis is reachable before launching.

## Common scripts

| Command | Description |
| --- | --- |
| `pnpm --filter @love-parser/backend dev` | Start Fastify with hot reload (includes queue workers & cron). |
| `pnpm --filter @love-parser/backend build` | Type-checks and emits `dist/` with path aliases fixed via `tsc-alias`. |
| `pnpm --filter @love-parser/backend start` | Run the compiled build (used in production). |
| `pnpm --filter @love-parser/backend test` | Execute Vitest suites. |
| `pnpm --filter @love-parser/backend db:migrate` | Apply the latest Knex migrations. |
| `pnpm --filter @love-parser/backend db:rollback` | Roll back the last migration batch. |
| `pnpm --filter @love-parser/backend db:seed` | Seed supporting data (usage limits, demo accounts, etc.). |

## Documentation index

- [API specification](./API_SPEC.md)
- [Deployment guide](./DEPLOYMENT.md)
- [Architecture overview](./ARCHITECTURE.md)
- [Developer guide](./DEV_GUIDE.md)

## Contributing

Follow the [developer guide](./DEV_GUIDE.md) before opening a pull request: align with the service-layer pattern, cover changes with Vitest, update Zod schemas & TypeScript types together, and keep the documentation in sync (API spec, deployment, architecture). Use feature branches per ticket and ensure lint/tests pass prior to pushing.
