# CI/CD Runbook

This document describes the automated testing, container build, and deployment flows that run inside GitHub Actions together with the manual procedures for redeploying or rolling back the platform.

## Workflow overview

| Workflow | File | Trigger | Highlights |
| --- | --- | --- | --- |
| Test & Quality Gate | `.github/workflows/test.yml` | Every push + pull request | Installs workspace deps with pnpm, boots disposable Postgres (`test-loveparser`) and Redis services, runs ESLint (frontend + backend), TypeScript strict checks, unit + integration suites (Vitest/Supertest), generates 80%+ coverage, executes DB migrations (apply/rollback) against the test database, runs npm audit + OWASP dependency scanning, builds both apps, and uploads coverage & security reports as artifacts. |
| Docker image build | `.github/workflows/docker-build.yml` | Every git tag | Builds `backend/Dockerfile` and `frontend/Dockerfile`, pushes to GitHub Container Registry (`ghcr.io/<org>/<repo>/{backend,frontend}`), then scans each image with Trivy (SARIF uploaded to the Security tab). |
| Staging deploy | `.github/workflows/deploy-staging.yml` | Pushes to `develop` | Reuses the full test matrix, builds/pushes Docker images tagged with the commit SHA + `staging`, ships them to the staging VPS via the blue/green script, runs remote DB migrations with automatic rollback, executes public smoke tests against `https://staging.loveparser.ru`, and notifies the Slack channel. |
| Production deploy | `.github/workflows/deploy-production.yml` | Pushes to `main` or tags matching `release-*` | Same verification/build stages, requires manual approval through the GitHub **production** environment, deploys via blue/green, performs health + smoke checks, rolls back on failure, and sends both Slack and email notifications. |

## Secrets & environment configuration

All sensitive values are stored as GitHub Secrets/Environments:

| Secret | Used by | Purpose |
| --- | --- | --- |
| `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_DEPLOY_PATH` | Staging deploy | SSH access to the staging VPS and remote path that contains the blue/green compose files. The SSH private key is written to an ephemeral file on the runner. |
| `STAGING_HEALTHCHECK_URL`, `STAGING_SMOKE_TEST_URL` | Staging deploy | Internal health endpoint (used inside the remote host) and public smoke-test endpoint (hit from GitHub runners). |
| `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USER`, `PRODUCTION_SSH_KEY`, `PRODUCTION_DEPLOY_PATH` | Production deploy | Same as staging but for the production VPS. These secrets must belong to the **production** environment to enforce approvals. |
| `PRODUCTION_HEALTHCHECK_URL`, `PRODUCTION_SMOKE_TEST_URL` | Production deploy | HTTP probes after a blue/green switch and from the public internet. |
| `SLACK_WEBHOOK_URL` | Staging + production deploy | Incoming webhook that receives deployment status messages (start, success, or failure). |
| `PRODUCTION_EMAIL_HOST`, `PRODUCTION_EMAIL_PORT`, `PRODUCTION_EMAIL_USERNAME`, `PRODUCTION_EMAIL_PASSWORD`, `PRODUCTION_EMAIL_TO` | Production deploy | SMTP credentials used by `dawidd6/action-send-mail` to notify ops stakeholders after every production release. |

Secrets referenced by Docker/Node (DB credentials, Telegram keys, Robokassa, etc.) stay inside `.env.staging`, `.env.production`, or GitHub environment variables. Example templates live in:

- `backend/.env.staging.example` and `backend/.env.production.example`
- `frontend/.env.staging.example` and `frontend/.env.production.example`

Each environment has a dedicated domain (`staging.loveparser.ru`, `loveparser.ru`) and connection strings. Never commit the populated `.env.*` files—the `.gitignore` already covers them.

## Testing & coverage guarantees

- **Databases**: The test workflow provisions a real Postgres 16 container named `test-loveparser`. The backend exposes `pnpm --filter @love-parser/backend db:wait` to block until the service is ready, and migrations are applied + rolled back on every run. `src/__tests__/database/migrations.test.ts` continues to validate schema correctness via `pg-mem` for unit-level safety.
- **Redis**: A disposable Redis 7 service is started in CI. The new `pnpm --filter @love-parser/backend redis:healthcheck` script validates connectivity before the Vitest suites run.
- **Vitest**: `backend/vitest.config.ts` enforces strict mode, parallel workers, 30s hooks/test timeouts, and 80% coverage thresholds. Coverage reports (`text`, `json-summary`, `lcov`) are uploaded as build artifacts and can fail the workflow if the threshold is missed.
- **Security**: `npm audit --audit-level=high` runs for the backend workspace, while OWASP Dependency Check (via `dependency-check/Dependency-Check_Action`) outputs an HTML report in the `reports/` folder. Trivy scans container images before deployment.

## Blue/green deployments

`deployment/scripts/deploy-blue-green.sh` handles traffic switching with zero downtime:

1. Reads the current slot (`.active_slot` in the remote deploy directory) and targets the opposite slot (`blue` vs `green`).
2. Exports `BACKEND_IMAGE`/`FRONTEND_IMAGE` so the remote Docker Compose files can consume the freshly pushed tags.
3. Starts the inactive compose file, runs backend migrations (`npm run db:migrate` inside the container by default), and performs an internal health check.
4. On success, the slot marker is updated and the previously active stack is shut down. On failure, the script rolls back automatically by:
   - Executing the rollback command (`npm run db:rollback`)
   - Stopping the failing compose file
   - Re-starting the previously active slot

The script intentionally never prints environment secrets. To run it manually:

```bash
./deployment/scripts/deploy-blue-green.sh \
  --environment staging \
  --host "$STAGING_SSH_HOST" \
  --user "$STAGING_SSH_USER" \
  --key /tmp/staging.key \
  --deploy-path /opt/love-parser \
  --backend-image ghcr.io/org/love-parser/backend:$(git rev-parse --short HEAD) \
  --frontend-image ghcr.io/org/love-parser/frontend:$(git rev-parse --short HEAD) \
  --healthcheck-url https://staging.loveparser.ru/health
```

Ensure the remote host contains `docker-compose.blue.yml` and `docker-compose.green.yml` files that reference `${BACKEND_IMAGE}` and `${FRONTEND_IMAGE}` placeholders.

### Smoke tests

`deployment/scripts/smoke-test.sh` performs HTTP probes from the runner (or your laptop) against `/health` and any business endpoint (default: `/api/v1/health`). Example:

```bash
./deployment/scripts/smoke-test.sh \
  --base-url https://staging.loveparser.ru \
  --smoke-path /api/v1/dashboard \
  --retries 10
```

### Manual rollback

If automation fails or you need to revert quickly, use `deployment/scripts/rollback.sh`:

```bash
./deployment/scripts/rollback.sh \
  --host "$PRODUCTION_SSH_HOST" \
  --user "$PRODUCTION_SSH_USER" \
  --key /tmp/prod.key \
  --deploy-path /opt/love-parser
```

By default it flips to the opposite slot and runs the rollback migration command. Pass `--target-slot blue` to pin a specific stack.

## Manual deployment (last resort)

1. Build and push the images locally:
   ```bash
   docker build -t ghcr.io/org/love-parser/backend:manual ./backend
   docker build -t ghcr.io/org/love-parser/frontend:manual ./frontend
   docker push ghcr.io/org/love-parser/backend:manual
   docker push ghcr.io/org/love-parser/frontend:manual
   ```
2. Run the blue/green script with the manual tags.
3. Execute smoke tests.
4. Update the Slack channel manually with the release notes.

## Notifications & alerting

- **Slack**: Both deploy workflows send structured payloads (environment, commit SHA, actor, status URL). Failures include the job URL for triage.
- **Email**: Production deployments deliver a summary (version/tag, duration, slot activated, smoke test links) to the on-call distribution list via SMTP.
- **Security alerts**: OWASP/Trivy SARIF files are uploaded to GitHub Security so maintainers receive native alerts if new CVEs are detected.

Keep secrets out of workflow logs: all scripts avoid `set -x`, key files are stored under `/tmp/*.key`, and workflow steps rely on masked secrets.
