# Production Monitoring Stack

This directory contains an opinionated Prometheus + Grafana + Alertmanager + Loki stack that satisfies the production monitoring requirements for Love Parser. It ships with exporters for every runtime dependency, curated Grafana dashboards, alert rules, logging aggregation, and a runbook that explains how to react to the most common incidents.

## What you get

| Component | Purpose | Notes |
| --- | --- | --- |
| Prometheus (`prom/prometheus`) | Metrics collection & alert evaluation | 15s scrape interval, 30-day retention on a dedicated `prometheus-data` volume. |
| Alertmanager (`prom/alertmanager`) | Notification routing | Pre-wired Slack, email, SMS (webhook), and PagerDuty receivers. |
| Grafana (`grafana/grafana`) | Dashboards & alert visualization | Auto-provisioned data sources (Prometheus + Loki) and 5 production-ready dashboards. |
| Postgres exporter (`quay.io/prometheuscommunity/postgres-exporter`) | Database metrics | Requires the Love Parser database DSN. Surfaces query duration, connection pool, table size data. |
| Redis exporter (`oliver006/redis_exporter`) | Cache/queue metrics | Tracks latency, memory footprint, key counts, eviction rate. |
| Node exporter (`prom/node-exporter`) | Host-level metrics | CPU, memory, disk space, filesystem saturation for alerting. |
| Loki (`grafana/loki`) + Promtail | Centralized logging | Ships Docker + Winston logs + Postgres query logs into Loki for long-lived search. |

## Quick start

1. Copy the environment template and fill in the connection strings + credentials:
   ```bash
   cd monitoring
   cp .env.example .env
   # edit .env (Slack webhook, SMTP creds, exporter DSNs, Grafana admin password, etc.)
   ```
2. Ensure the backend, Postgres, and Redis containers share a Docker network with the monitoring stack (e.g., `docker network create love-parser-net` then `docker network connect love-parser-net love-parser-backend`).
3. Launch the stack:
   ```bash
   docker compose up -d
   ```
4. Visit Grafana (default `http://localhost:3001`) and sign in with the credentials from `.env`.

> **Retention & storage** – Prometheus stores data under the `prometheus-data` volume with `--storage.tsdb.retention.time=30d`; Loki has its own `loki-data` volume. Back up or snapshot the volumes to retain history beyond 30 days.

## Prometheus configuration

- `prometheus/prometheus.yml` scrapes:
  - `backend:3000/metrics` for Fastify / Bull metrics.
  - `postgres-exporter:9187`
  - `redis-exporter:9121`
  - `node-exporter:9100`
- Alert rules live in `prometheus/rules/alerts.yml` and cover error rates, latency, queue stagnation, payment callbacks, disk/memory pressure, Redis availability, and DB pool exhaustion.
- Storage is isolated via the `prometheus-data` volume so metrics survive container restarts.

To add a new scrape target, extend `scrape_configs` and restart Prometheus (or send a `SIGHUP`).

## Grafana dashboards

Provisioned dashboards are stored under `grafana/provisioning/dashboards/`:

1. **Backend Observability** (`backend.json`)
   - HTTP latency p50/p95/p99 (`http_request_duration_seconds`)
   - Error rates per route, memory usage, DB/Redis connections, system load
2. **Database Health** (`database.json`)
   - Query duration, slow query rate, connection pool saturation, table sizes
3. **Redis Health** (`redis.json`)
   - Command latency, memory usage, keyspace, eviction rate, hit/miss ratio
4. **Bull Queues** (`queues.json`)
   - Queue depth, job duration histogram, successes vs failures, last completion timestamp
5. **Application KPIs** (`application.json`)
   - Broadcast sent/failed, parsing jobs processed, audience segments ready/failed, payment success rate, business counters (broadcasts, payments, parsing, etc.)

### Accessing Grafana

- URL: `http://localhost:3001` (override via `docker-compose.yml`)
- Credentials: `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD` from `.env`
- Default Prometheus data source UID: `love-prom` (referenced inside dashboard JSON)
- Loki data source UID: `love-loki`

### Creating custom dashboards

1. Use the Grafana UI to build a panel.
2. Save it to an existing folder or create a new one.
3. To make it permanent, click **Share > Export > Export for sharing externally** and drop the JSON into `grafana/provisioning/dashboards/`. Update `dashboards.yml` to register the new file.
4. Restart Grafana (or call the provisioning API) to load the updated dashboard.

### Adding new alerts

1. Edit `prometheus/rules/alerts.yml` and append a rule inside the `love-parser-production` group. Follow the existing style: name, PromQL expression, `for`, `labels`, and `annotations`.
2. Reload Prometheus (`docker compose exec prometheus kill -HUP 1`) or restart the container.
3. Document the new alert in `RUNBOOK.md` so on-call engineers know how to triage it.

## Notification channels

Alertmanager routes are defined in `alertmanager/alertmanager.yml`:

- **Slack** (`receiver: slack-notifications`): send warnings to `#ops-love-parser`. Update the `api_url` and channel name.
- **Email** (`receiver: email-critical`): critical alerts fan out via SMTP (TLS enabled). Configure `smarthost`, `from`, and credentials.
- **SMS (optional)**: `sms-escalation` uses a generic webhook (e.g., Twilio, OpsGenie). Set the URL and tokens if you want text messages for select alerts (matchers already included for alerts with `notify_sms="true"`).
- **PagerDuty (optional)**: supply the routing key to push high-severity incidents into the PagerDuty service.

Test notifications with `amtool`:
```bash
docker compose exec alertmanager amtool --alertmanager.url=http://localhost:9093 alert add TestAlert severity=warning
```
Then clear it with `amtool alert query TestAlert --delete`.

## Logging aggregation

`logging/promtail-config.yml` tails:

- `backend/logs/*.log` – Winston JSON logs emitted by the Fastify service.
- Docker engine logs (`/var/lib/docker/containers/*/*.log`) – captures stdout/stderr for every container.
- Postgres logs (`/var/log/postgresql/*.log`) – useful for slow query analysis.

Logs are shipped to Loki (`logging/loki-local-config.yaml`). Grafana already has the Loki data source, so you can run LogQL queries directly from the **Explore** tab.

> **Sentry (optional)** – the backend now accepts `SENTRY_DSN` (see `backend/.env.example`). When set, critical errors are forwarded to Sentry in addition to Loki/Grafana logs.

## Health endpoints & Kubernetes probes

The backend exposes:

- `GET /health` – lightweight JSON heartbeat with uptime
- `GET /health/live` – liveness probe (bind this to Kubernetes `livenessProbe`)
- `GET /health/ready` – readiness summary (fails fast when Postgres/Redis/Telegram are down)
- `GET /health/db`, `/health/redis`, `/health/telegram` – deep dependency checks

Both `/health/*` and `/api/health/*` are registered, so probes can hit either path inside Kubernetes or Docker Compose.

## Runbook & incident response

`RUNBOOK.md` contains step-by-step guidance for every alert defined in Prometheus (error rate, latency, DB pool exhaustion, Redis down, queue stuck, payment callback failures, disk/memory pressure). Keep it up to date whenever you introduce a new alert or modify remediation steps.

## Testing alerts

Use the provided metrics to simulate incidents:

- Force an HTTP 500 locally and watch `HighErrorRate` fire.
- Pause the broadcast worker to trigger `BroadcastQueueStuck`.
- Fill the disk (or tweak alert thresholds) to exercise the disk pressure rule.

Every alert is annotated with runbook links and expected remediation so Slack/email recipients immediately know what to do.
