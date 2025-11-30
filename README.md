# Love Parser Monorepo

## Overall project description

Love Parser is a Telegram-native growth toolkit: it authenticates users via Telegram, scans channels to discover new audiences, builds marketing segments, ships outbound broadcasts, and monetizes access through paid subscription plans. This repository houses **two apps** – a React/Vite frontend and a Fastify/TypeScript backend with background workers – sharing the same workspace for dependency management and tooling.

## Monorepo structure

```
love-parser/
├── backend/               # Fastify API, Bull workers, integrations, docs
│   ├── src/
│   ├── README.md          # Backend overview + quick start
│   ├── API_SPEC.md        # OpenAPI spec + endpoint docs
│   ├── ARCHITECTURE.md    # System design + data flows
│   ├── DEPLOYMENT.md      # Ops / infra guide
│   └── DEV_GUIDE.md       # Contribution rules for backend
├── frontend/              # Vite + React 18 client
│   ├── src/
│   └── README.md          # Frontend quick start & scripts
├── package.json           # Workspace scripts & tooling
├── pnpm-workspace.yaml    # Declares backend + frontend packages
└── README.md              # (this file) repo-wide instructions
```

## Documentation map

| Scope | Location | Highlights |
| --- | --- | --- |
| Frontend UI | [`frontend/README.md`](./frontend/README.md) | Vite dev server, scripts, env vars. |
| Backend API | [`backend/README.md`](./backend/README.md) | Features, scripts, links to deeper docs. |
| API contract | [`backend/API_SPEC.md`](./backend/API_SPEC.md) | Endpoints, schemas, auth requirements. |
| Deployment | [`backend/DEPLOYMENT.md`](./backend/DEPLOYMENT.md) | Docker, env vars, Robokassa, SSL/TLS. |
| Architecture | [`backend/ARCHITECTURE.md`](./backend/ARCHITECTURE.md) | Components, DB schema, diagrams, monitoring. |
| CI/CD runbook | [`docs/ci-cd.md`](./docs/ci-cd.md) | Workflows, secrets, blue/green deployments, rollback & smoke tests. |
| Developer workflow | [`backend/DEV_GUIDE.md`](./backend/DEV_GUIDE.md) | Local setup, tests, code style, Git workflow. |

См. [QUICK_START](./QUICK_START) для быстрого старта на русском языке.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) (enable via `corepack enable pnpm`)
- Docker (optional, for running PostgreSQL/Redis locally)

## Installing dependencies

```bash
corepack enable pnpm
pnpm install
```

This installs dependencies for both `@love-parser/frontend` and `@love-parser/backend` thanks to the workspace configuration.

## Environment configuration

- **Frontend**: copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_URL` (defaults to `http://localhost:3000`). See [`frontend/README.md`](./frontend/README.md).
- **Backend**: copy `backend/.env.example` to `backend/.env` and customize Postgres/Redis/JWT/Telegram/Robokassa credentials. The server listens on port `3000` by default (details in [`backend/DEPLOYMENT.md`](./backend/DEPLOYMENT.md)).

## Running locally

From the repository root you can use the workspace scripts:

```bash
pnpm dev:frontend   # start Vite dev server (port 5173 by default)
pnpm dev:backend    # start Fastify backend with hot reload (port 3000)
pnpm dev            # run both concurrently
```

Additional scripts:

- `pnpm build:frontend` – build the Vite application
- `pnpm lint` – run the frontend ESLint config
- `pnpm test:backend` – execute backend Vitest suites (placeholder)

## Docker Compose (backend)

The backend ships with a compose file that provisions PostgreSQL 15, Redis 7 and a dev-ready Node container:

```bash
cd backend
cp .env.example .env # edit as needed
docker compose up
```

The compose stack exposes:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- Fastify API on `localhost:3000`

## CI/CD & deployment automation

- **GitHub Actions** now covers linting, strict TypeScript checks, Vitest unit/integration suites, code coverage (>80%), DB migrations, npm audit, OWASP Dependency Check, and frontend/backend builds on every push/PR (`.github/workflows/test.yml`).
- **Docker images** for both apps are built from `backend/Dockerfile` and `frontend/Dockerfile` and pushed to GHCR on every Git tag, then scanned with Trivy (`docker-build.yml`).
- **Staging deploys** trigger automatically from `develop` pushes, leveraging the blue/green script plus smoke tests against `https://staging.loveparser.ru` and Slack notifications.
- **Production deploys** run on `main` or `release-*` tags, require environment approval, perform the same verifications, and send Slack + email notifications with automatic rollback on failure.
- **Scripts** under `deployment/scripts/` (`deploy-blue-green.sh`, `smoke-test.sh`, `rollback.sh`) can be executed locally for manual recovery—see [`docs/ci-cd.md`](./docs/ci-cd.md) for usage.

## Notes

- Frontend aliases (`@/*`) continue to work after moving the source into `frontend/src`.
- Backend utilities (`@utils/*`, `@services/*`, etc.) are configured through `backend/tsconfig.json`.
- Refer to the documentation map above for deeper dives into APIs, deployment, architecture, and developer workflow.
