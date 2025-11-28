import type Queue from "bull";
import { FastifyInstance, FastifyRequest } from "fastify";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

import { JobTypes } from "@/jobs/jobTypes";
import { logger } from "@/monitoring/errorLogger";
import { pgPool } from "@/utils/clients";
import { getRegisteredQueues } from "@/queue/queueManager";
import { getRedisPoolStats } from "@/services/redis.service";

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code", "outcome"],
  registers: [metricsRegistry],
});

export const httpRequestDurationHistogram = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

export const telegramApiCallsTotal = new Counter({
  name: "telegram_api_calls_total",
  help: "Total count of Telegram API calls grouped by method",
  labelNames: ["method"],
  registers: [metricsRegistry],
});

export const telegramApiErrorsTotal = new Counter({
  name: "telegram_api_errors_total",
  help: "Total count of Telegram API failures grouped by method",
  labelNames: ["method"],
  registers: [metricsRegistry],
});

export const broadcastSentTotal = new Counter({
  name: "broadcast_sent_total",
  help: "Number of broadcast messages sent",
  registers: [metricsRegistry],
});

export const broadcastFailedTotal = new Counter({
  name: "broadcast_failed_total",
  help: "Number of broadcast messages that failed",
  registers: [metricsRegistry],
});

export const databaseConnectionsGauge = new Gauge({
  name: "database_connections_active",
  help: "Active PostgreSQL connections",
  registers: [metricsRegistry],
});

export const redisConnectionsGauge = new Gauge({
  name: "redis_connections_active",
  help: "Active Redis connections",
  registers: [metricsRegistry],
});

export const jobQueueSizeGauge = new Gauge({
  name: "job_queue_size",
  help: "Bull queue size grouped by queue type",
  labelNames: ["queue"],
  registers: [metricsRegistry],
});

export const subscriptionActiveGauge = new Gauge({
  name: "subscription_active_count",
  help: "Number of active subscriptions",
  registers: [metricsRegistry],
});

export const cronJobResultCounter = new Counter({
  name: "cron_job_runs_total",
  help: "Total cron job executions grouped by status",
  labelNames: ["job_name", "status"],
  registers: [metricsRegistry],
});

export const cronJobDurationHistogram = new Histogram({
  name: "cron_job_duration_seconds",
  help: "Duration of cron job executions in seconds",
  labelNames: ["job_name"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

export function recordTelegramApiCall(method: string) {
  telegramApiCallsTotal.labels(method).inc();
}

export function recordTelegramApiError(method: string) {
  telegramApiErrorsTotal.labels(method).inc();
}

export function recordBroadcastSuccess(count = 1) {
  if (count <= 0) {
    return;
  }
  broadcastSentTotal.inc(count);
}

export function recordBroadcastFailure(count = 1) {
  if (count <= 0) {
    return;
  }
  broadcastFailedTotal.inc(count);
}

const RESOURCE_COLLECTION_INTERVAL_MS = 10_000;
let resourceCollector: NodeJS.Timeout | null = null;
let collectorsRunning = false;

function resolveRouteLabel(request: FastifyRequest) {
  return request.routerPath ?? request.routeOptions?.url ?? request.url;
}

function determineOutcome(statusCode: number, hadError?: boolean) {
  if (hadError || statusCode >= 500) {
    return "error";
  }
  if (statusCode >= 400) {
    return "client_error";
  }
  return "success";
}

export function registerPrometheusMiddleware(app: FastifyInstance) {
  app.addHook("onRequest", (request, _reply, done) => {
    const start = process.hrtime.bigint();
    if (request.requestContext) {
      request.requestContext.metricsStartTime = start;
    } else {
      request.requestContext = { startTime: start, metricsStartTime: start };
    }
    done();
  });

  app.addHook("onError", (request, _reply, _error, done) => {
    if (!request.requestContext) {
      request.requestContext = { startTime: process.hrtime.bigint() };
    }
    request.requestContext.hadError = true;
    done();
  });

  app.addHook("onResponse", (request, reply, done) => {
    try {
      const statusCode = reply.statusCode || 500;
      const route = resolveRouteLabel(request);
      const method = request.method;
      const outcome = determineOutcome(statusCode, request.requestContext?.hadError);

      httpRequestsTotal.labels(method, route, statusCode.toString(), outcome).inc();

      const start = request.requestContext?.metricsStartTime ?? request.requestContext?.startTime;
      if (start) {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
        httpRequestDurationHistogram.labels(method, route, statusCode.toString()).observe(durationSeconds);
      }
    } finally {
      done();
    }
  });
}

async function updateDatabaseMetrics() {
  try {
    const activeConnections = Math.max(pgPool.totalCount - pgPool.idleCount, 0);
    databaseConnectionsGauge.set(activeConnections);
  } catch (error) {
    logger.warn("Failed to update database metrics", { error });
  }
}

async function updateRedisMetrics() {
  try {
    const stats = getRedisPoolStats();
    redisConnectionsGauge.set(stats.inUse);
  } catch (error) {
    logger.warn("Failed to update redis metrics", { error });
  }
}

async function updateSubscriptionMetrics() {
  try {
    const result = await pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM subscriptions
       WHERE status = 'active' AND expires_at > NOW()`,
    );
    const count = Number(result.rows[0]?.count ?? 0);
    subscriptionActiveGauge.set(count);
  } catch (error) {
    logger.warn("Failed to update subscription metrics", { error });
  }
}

async function measureQueue(queue: Queue, jobType: JobTypes) {
  try {
    const [waiting, delayed, active] = await Promise.all([
      queue.getWaitingCount(),
      queue.getDelayedCount(),
      queue.getActiveCount(),
    ]);
    jobQueueSizeGauge.labels(jobType).set(waiting + delayed + active);
  } catch (error) {
    logger.warn("Failed to collect queue metrics", { queue: jobType, error });
  }
}

async function updateJobQueueMetrics() {
  const queues = getRegisteredQueues();
  if (!queues) {
    return;
  }

  await Promise.all(Object.entries(queues).map(([jobType, queue]) => measureQueue(queue, jobType as JobTypes)));
}

async function collectResourceMetrics() {
  await Promise.all([updateDatabaseMetrics(), updateRedisMetrics(), updateSubscriptionMetrics(), updateJobQueueMetrics()]);
}

export function startMonitoringCollectors() {
  if (collectorsRunning) {
    return;
  }

  collectorsRunning = true;
  void collectResourceMetrics();
  resourceCollector = setInterval(() => {
    void collectResourceMetrics();
  }, RESOURCE_COLLECTION_INTERVAL_MS);
  resourceCollector.unref?.();
}

export function stopMonitoringCollectors() {
  if (resourceCollector) {
    clearInterval(resourceCollector);
    resourceCollector = null;
  }
  collectorsRunning = false;
}
