import { FastifyPluginAsync } from "fastify";

import { ensureTelegramClient } from "@/services/telegram.service";
import { withRedisClient } from "@/services/redis.service";
import { pgPool } from "@/utils/clients";
import { ServiceUnavailableError } from "@/utils/errors";

const toMilliseconds = (start: bigint) => Number(process.hrtime.bigint() - start) / 1_000_000;

type ComponentStatus = "ok" | "failed";

interface ComponentHealth {
  name: string;
  status: ComponentStatus;
  response_time_ms?: number;
  details?: Record<string, unknown>;
}

interface ReadinessSummary {
  status: ComponentStatus;
  components: ComponentHealth[];
}

async function checkDatabaseHealth(): Promise<ComponentHealth> {
  const started = process.hrtime.bigint();
  try {
    await pgPool.query("SELECT 1");
    return {
      name: "postgres",
      status: "ok",
      response_time_ms: Math.round(toMilliseconds(started)),
    } satisfies ComponentHealth;
  } catch (error) {
    return {
      name: "postgres",
      status: "failed",
      details: { error: (error as Error).message },
    } satisfies ComponentHealth;
  }
}

async function checkRedisHealth(): Promise<ComponentHealth> {
  const started = process.hrtime.bigint();
  try {
    await withRedisClient((client) => client.ping());
    return {
      name: "redis",
      status: "ok",
      response_time_ms: Math.round(toMilliseconds(started)),
    } satisfies ComponentHealth;
  } catch (error) {
    return {
      name: "redis",
      status: "failed",
      details: { error: (error as Error).message },
    } satisfies ComponentHealth;
  }
}

async function checkTelegramHealth(): Promise<ComponentHealth> {
  try {
    await ensureTelegramClient();
    const result = await pgPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM telegram_sessions
       WHERE is_active = true`,
    );

    return {
      name: "telegram",
      status: "ok",
      details: {
        active_sessions: Number(result.rows[0]?.count ?? 0),
      },
    } satisfies ComponentHealth;
  } catch (error) {
    return {
      name: "telegram",
      status: "failed",
      details: { error: (error as Error).message },
    } satisfies ComponentHealth;
  }
}

async function runReadinessChecks(): Promise<ReadinessSummary> {
  const [db, redis, telegram] = await Promise.all([checkDatabaseHealth(), checkRedisHealth(), checkTelegramHealth()]);
  const status: ComponentStatus = [db, redis, telegram].every((check) => check.status === "ok") ? "ok" : "failed";
  return { status, components: [db, redis, telegram] } satisfies ReadinessSummary;
}

function buildLivePayload() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.round(process.uptime()),
  };
}

export const registerHealthCheckRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => buildLivePayload());

  app.get("/health/live", async () => buildLivePayload());

  app.get("/health/ready", async () => {
    const summary = await runReadinessChecks();
    if (summary.status !== "ok") {
      throw new ServiceUnavailableError("Readiness checks failed", { details: summary });
    }
    return summary;
  });

  app.get("/health/db", async () => {
    const result = await checkDatabaseHealth();
    if (result.status !== "ok") {
      throw new ServiceUnavailableError("PostgreSQL is unavailable", { details: result });
    }
    return { status: "ok", response_time: result.response_time_ms };
  });

  app.get("/health/redis", async () => {
    const result = await checkRedisHealth();
    if (result.status !== "ok") {
      throw new ServiceUnavailableError("Redis is unavailable", { details: result });
    }
    return { status: "ok", response_time: result.response_time_ms };
  });

  app.get("/health/telegram", async () => {
    const result = await checkTelegramHealth();
    if (result.status !== "ok") {
      throw new ServiceUnavailableError("Telegram is unavailable", { details: result });
    }
    return { status: "ok", active_sessions: result.details?.active_sessions ?? 0 };
  });
};
