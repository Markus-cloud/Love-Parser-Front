# Deployment Guide

This document describes how to deploy the Love Parser backend (Fastify API + queue workers) together with its dependencies (PostgreSQL, Redis, Telegram, Robokassa). The backend process runs HTTP traffic, Bull queues, and cron jobs in a single Node.js service, so only one process per environment is required.

> Looking for CI/CD, blue/green scripts, or secret management? See [`docs/ci-cd.md`](../docs/ci-cd.md) for the automation runbook.

## 1. Prerequisites

- Linux host with Node.js 20 (or Docker runtime).
- PostgreSQL 15+ and Redis 7 (compose or managed cloud services).
- Telegram API credentials (API ID + hash) and an authenticated session string.
- Robokassa merchant account with result URLs pointing to `/api/v1/subscriptions/webhook/robokassa`.
- Public-facing reverse proxy (Nginx/Caddy/Traefik) with TLS certificates for production.

## 2. Docker Compose stack

A reference stack ships in `backend/docker-compose.yml`.

```bash
cd backend
cp .env.example .env  # adjust secrets
docker compose up -d postgres redis
```

To run the backend container as well:

```bash
docker compose up -d
```

The container mounts the repository into `/workspace`, installs dependencies via pnpm, runs migrations, and starts `pnpm --filter @love-parser/backend dev`. Customize the `command` for production (e.g., run `pnpm build` once and `pnpm start`).

## 3. Environment variables

| Variable | Required | Description | Default/example |
| --- | --- | --- | --- |
| `NODE_ENV` | ✅ | `development`, `production`, or `test` | `development` |
| `HOST`, `PORT` | ✅ | Bind host/port for Fastify | `0.0.0.0`, `3000` |
| `FRONTEND_URL`, `CORS_ORIGIN` | ✅ | Allow-list origins for CORS + link tokens | `http://localhost:8080` |
| `JWT_SECRET` | ✅ | 256-bit secret for access tokens | `super-secret-string` |
| `SESSION_ENCRYPTION_KEY` | ✅ | 32+ char secret for AES-GCM Telegram session storage | `super-secret-session-key-change-me` |
| `REQUEST_BODY_LIMIT` | ➖ | Max request body bytes | `1048576` |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | ➖ | Global rate limiter window + threshold | `60000`, `100` |
| `DATABASE_URL` / `POSTGRES_URL` | ✅ | PostgreSQL connection string (same value) | `postgresql://user:pass@host:5432/love_parser` |
| `REDIS_URL` | ✅ | Redis connection string (use `rediss://` for TLS) | `redis://localhost:6379` |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | ✅ | Telegram client credentials | `0`, `changeme` |
| `TELEGRAM_SESSION` | ➖ | Optional pre-authorized session (base64) | `""` |
| `ROBOKASSA_MERCHANT_LOGIN` | ✅ | Robokassa merchant name | `demoMerchant` |
| `ROBOKASSA_PASSWORD1/2` | ✅ | Passwords for signature verification | `demoPassword1`, `demoPassword2` |
| `ROBOKASSA_IS_TEST` | ➖ | Enables test mode (boolean) | `true` |
| `ROBOKASSA_PAYMENT_URL` | ➖ | Override payment endpoint | `https://auth.robokassa.ru/Merchant/Index.aspx` |

> Tip: keep `POSTGRES_*` helper variables in `.env` if you rely on Docker Compose interpolation.

## 4. Database migrations

1. Provision PostgreSQL and ensure the configured user has `CREATE EXTENSION` privileges (needed for `pgcrypto`).
2. Run migrations from the repository root (PNPM workspace aware):
   ```bash
   pnpm --filter @love-parser/backend db:migrate
   ```
3. To roll back the last batch: `pnpm --filter @love-parser/backend db:rollback`.
4. Seed helper data if required: `pnpm --filter @love-parser/backend db:seed` (usage limits, demo plans, etc.).
5. Verify the schema using `\dt` inside psql – key tables include `users`, `subscriptions`, `usage_limits`, `parsing_history`, `parsed_channels`, `audience_segments`, `payments`, `telegram_sessions`, and `error_logs`.

## 5. Redis setup

- The backend maintains its own connection pool (up to 5 clients). Point `REDIS_URL` to a reachable instance before boot.
- Use the Compose-provided Redis 7 container for local development. For production, provision a managed Redis (AWS Elasticache, Upstash, etc.) and prefer TLS endpoints.
- Redis is used for rate limiting, Telegram auth state, token blacklist, Bull queues, and parsing progress snapshots. Ensure persistent storage / backups match your SLA.

## 6. Robokassa configuration

1. In the Robokassa cabinet, configure the **Result URL** to `https://<your-domain>/api/v1/subscriptions/webhook/robokassa`.
2. Set the **Success/Fail URLs** to a frontend route (e.g., `https://app.love-parser.io/payments/success`).
3. Copy `MerchantLogin`, `Password1`, `Password2` into `.env`. Toggle `ROBOKASSA_IS_TEST=false` for production accounts.
4. If you use Robokassa test servers, leave the default `ROBOKASSA_PAYMENT_URL`. For production, they supply a merchant-specific hostname.
5. Ensure signatures are built with `Password2` (result URL). The webhook verifies the SHA-256 signature and enforces idempotency per `InvId`.

## 7. SSL/TLS & reverse proxy

Fastify terminates plain HTTP. For production:

1. Place Nginx/Caddy/Traefik in front of the Node.js process.
2. Terminate TLS at the proxy (Let’s Encrypt via certbot or the proxy’s built-in ACME).
3. Forward traffic to the backend over HTTP on the private network (e.g., `http://127.0.0.1:3000`).
4. Preserve client metadata:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Request-Id $request_id;
}
```

5. Update `CORS_ORIGIN` / `FRONTEND_URL` to the public HTTPS origin so the browser can call the API.
6. If you terminate TLS elsewhere, keep `HOST=0.0.0.0` and `PORT=3000` (Fastify respects `X-Forwarded-*`).

## 8. Deployment checklist

- [ ] Environment variables configured with production secrets.
- [ ] PostgreSQL migrations applied; seeds executed if necessary.
- [ ] Redis reachable with persistence policies aligned to rate-limit keys.
- [ ] Telegram API ID/hash verified; session string loaded (or login performed once in production to populate `telegram_sessions`).
- [ ] Robokassa webhook reachable from the internet (test with `curl` + sample payload).
- [ ] Reverse proxy + TLS certificates live; `/health` and `/metrics` restricted appropriately (metrics should stay internal).
- [ ] Process supervisor configured (systemd, PM2, Docker) to run `pnpm --filter @love-parser/backend start` and restart on failure.
- [ ] Log rotation configured (Winston already rotates files inside `logs/`; ensure disk permissions and backup policies are in place).

Once the checklist is satisfied, the service is production-ready.
