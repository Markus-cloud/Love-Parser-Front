import { createClient } from "redis";

import { getDatabasePool, initializeDatabase } from "@database/connection";
import { env } from "@utils/env";
import { logger } from "@utils/logger";

export const pgPool = getDatabasePool();
export const redisClient = createClient({ url: env.REDIS_URL });

export async function connectDatastores() {
  await initializeDatabase();

  redisClient.on("error", (error) => logger.error("Redis connection error", { error }));
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  logger.info("Connected to Redis");
}
