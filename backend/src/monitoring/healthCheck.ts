import { FastifyPluginAsync } from "fastify";

import { ensureTelegramClient } from "@/services/telegram.service";
import { withRedisClient } from "@/services/redis.service";
import { pgPool } from "@/utils/clients";
import { ServiceUnavailableError } from "@/utils/errors";

const toMilliseconds = (start: bigint) => Number(process.hrtime.bigint() - start) / 1_000_000;

export const registerHealthCheckRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/db", async () => {
    const started = process.hrtime.bigint();
    try {
      await pgPool.query("SELECT 1");
      return { status: "ok", response_time: Math.round(toMilliseconds(started)) };
    } catch (error) {
      throw new ServiceUnavailableError("PostgreSQL is unavailable", { details: { cause: (error as Error).message } });
    }
  });

  app.get("/health/redis", async () => {
    const started = process.hrtime.bigint();
    try {
      await withRedisClient((client) => client.ping());
      return { status: "ok", response_time: Math.round(toMilliseconds(started)) };
    } catch (error) {
      throw new ServiceUnavailableError("Redis is unavailable", { details: { cause: (error as Error).message } });
    }
  });

  app.get("/health/telegram", async () => {
    const started = process.hrtime.bigint();
    try {
      await ensureTelegramClient();
      const result = await pgPool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM telegram_sessions
         WHERE is_active = true`,
      );
      return {
        status: "ok",
        active_sessions: Number(result.rows[0]?.count ?? 0),
      };
    } catch (error) {
      throw new ServiceUnavailableError("Telegram is unavailable", { details: { cause: (error as Error).message } });
    }
  });
};
