import { Pool } from "pg";
import { createClient } from "redis";
import { env } from "@utils/env";
import { logger } from "@utils/logger";

export const pgPool = new Pool({ connectionString: env.POSTGRES_URL });
export const redisClient = createClient({ url: env.REDIS_URL });

export async function connectDatastores() {
  const client = await pgPool.connect();
  try {
    await client.query("SELECT 1");
    logger.info("Connected to PostgreSQL");
  } finally {
    client.release();
  }

  redisClient.on("error", (error) => logger.error("Redis connection error", { error }));
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  logger.info("Connected to Redis");
}
