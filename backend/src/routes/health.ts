import { FastifyInstance } from "fastify";

import { pgPool, redisClient } from "@/utils/clients";
import { ServiceUnavailableError } from "@/utils/errors";

const now = () => new Date().toISOString();

async function ensureDatabaseHealthy() {
  try {
    await pgPool.query("SELECT 1");
    return { status: "ok" as const };
  } catch (error) {
    throw new ServiceUnavailableError("PostgreSQL is unavailable", {
      details: { cause: (error as Error).message },
    });
  }
}

async function ensureRedisHealthy() {
  try {
    await redisClient.ping();
    return { status: "ok" as const };
  } catch (error) {
    throw new ServiceUnavailableError("Redis is unavailable", {
      details: { cause: (error as Error).message },
    });
  }
}

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    timestamp: now(),
  }));

  app.get("/health/db", async () => {
    await ensureDatabaseHealthy();
    return {
      status: "ok",
      service: "postgres",
      timestamp: now(),
    };
  });

  app.get("/health/redis", async () => {
    await ensureRedisHealthy();
    return {
      status: "ok",
      service: "redis",
      timestamp: now(),
    };
  });
}
