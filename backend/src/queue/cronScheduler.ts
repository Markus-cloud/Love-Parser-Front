import type Queue from "bull";

import { cronJobs } from "@/jobs/cron";
import { CronJobDefinition } from "@/jobs/cron/types";
import { JobPayloadMap, JobTypes } from "@/jobs/jobTypes";
import { getQueue, initializeQueues } from "@/queue/queueManager";
import { logger } from "@/utils/logger";

let schedulerStarted = false;

function getCronQueue(): Queue<JobPayloadMap[JobTypes.CRON]> {
  return getQueue(JobTypes.CRON);
}

async function registerCronJob(queue: Queue<JobPayloadMap[JobTypes.CRON]>, job: CronJobDefinition) {
  await queue.add(
    job.key,
    { jobKey: job.key },
    {
      jobId: job.key,
      repeat: {
        cron: job.schedule,
        tz: job.timezone ?? "UTC",
      },
      removeOnComplete: true,
      removeOnFail: false,
      attempts: job.maxAttempts ?? 3,
      backoff: {
        type: "exponential",
        delay: job.retryDelayMs ?? 60_000,
      },
    },
  );

  logger.info("Cron job registered", {
    jobKey: job.key,
    schedule: job.schedule,
    timezone: job.timezone ?? "UTC",
  });
}

function schedulesMatch(existingTz: string | undefined, job: CronJobDefinition, existingCron: string): boolean {
  const normalizedTz = existingTz ?? "UTC";
  const jobTz = job.timezone ?? "UTC";
  return normalizedTz === jobTz && existingCron === job.schedule;
}

export async function startCronScheduler() {
  if (schedulerStarted) {
    return;
  }

  await initializeQueues();
  const cronQueue = getCronQueue();
  await cronQueue.resume().catch(() => undefined);

  const repeatableJobs = await cronQueue.getRepeatableJobs();
  const repeatableIndex = new Map(repeatableJobs.map((entry) => [entry.id, entry]));

  for (const job of cronJobs) {
    const existing = repeatableIndex.get(job.key);

    if (existing) {
      if (schedulesMatch(existing.tz, job, existing.cron)) {
        logger.debug("Cron job already registered", { jobKey: job.key });
        continue;
      }

      await cronQueue.removeRepeatableByKey(existing.key);
      logger.info("Removed outdated cron schedule", { jobKey: job.key });
    }

    try {
      await registerCronJob(cronQueue, job);
    } catch (error) {
      logger.error("Failed to register cron job", { jobKey: job.key, error });
      throw error;
    }
  }

  schedulerStarted = true;
  logger.info("Cron scheduler started", { jobsRegistered: cronJobs.length });
}

export async function stopCronScheduler() {
  if (!schedulerStarted) {
    return;
  }

  const cronQueue = getCronQueue();

  try {
    await cronQueue.pause(true);
    logger.info("Cron scheduler paused");
  } catch (error) {
    logger.error("Failed to pause cron scheduler", { error });
  } finally {
    schedulerStarted = false;
  }
}
