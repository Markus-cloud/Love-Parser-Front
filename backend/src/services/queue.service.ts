import { startCronScheduler, stopCronScheduler } from "@/queue/cronScheduler";
import { initializeQueues } from "@/queue/queueManager";
import { logger } from "@/utils/logger";
import { startWorkers, stopWorkers } from "@/workers";

let queuesBootstrapped = false;

export async function bootstrapQueues() {
  if (queuesBootstrapped) {
    return;
  }

  await initializeQueues();
  await startWorkers();
  await startCronScheduler();
  queuesBootstrapped = true;
  logger.info("Redis and Bull queues bootstrapped");
}

export async function shutdownQueues() {
  if (!queuesBootstrapped) {
    return;
  }

  await stopCronScheduler();
  await stopWorkers();
  queuesBootstrapped = false;
  logger.info("Queues shutdown complete");
}
