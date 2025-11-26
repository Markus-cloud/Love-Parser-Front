import Queue from "bull";
import { env } from "@utils/env";
import { logger } from "@utils/logger";

export const broadcastQueue = new Queue("broadcasts", env.REDIS_URL);

export async function bootstrapQueues() {
  broadcastQueue.process(async (job) => {
    logger.debug("Processing broadcast job placeholder", { jobId: job.id });
    return job.data;
  });

  broadcastQueue.on("completed", (job) => {
    logger.info("Broadcast job completed", { jobId: job.id });
  });

  logger.info("Queues bootstrapped");
}
