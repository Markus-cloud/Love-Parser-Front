import { createClient } from "redis";

import { closeDatabasePool, getDatabasePool, initializeDatabase } from "@/database/connection";
import { config } from "@/config/config";
import { logger } from "@/utils/logger";

export const pgPool = getDatabasePool();
export const redisClient = createClient({ url: config.redis.url });

redisClient.on("error", (error) => logger.error("Redis connection error", { error }));

export async function connectDatastores() {
  await initializeDatabase();

  if (!redisClient.isOpen) {
    await redisClient.connect();
    logger.info("Connected to Redis");
  }
}

export async function disconnectDatastores() {
  await closeDatabasePool();

  if (redisClient.isOpen) {
    await redisClient.quit();
    logger.info("Redis connection closed");
  }
}
