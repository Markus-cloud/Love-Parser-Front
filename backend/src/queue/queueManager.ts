import Queue, { Job, QueueOptions } from "bull";

import { config } from "@/config/config";
import { JobPayloadMap, JobTypes } from "@/jobs/jobTypes";
import { logErrorEvent } from "@/monitoring/errorLogService";
import { recordQueueJobEvent } from "@/monitoring/prometheus";
import { logger } from "@/utils/logger";

type QueueRegistry = {
  [JobTypes.PARSE_SEARCH]: Queue<JobPayloadMap[JobTypes.PARSE_SEARCH]>;
  [JobTypes.BROADCAST]: Queue<JobPayloadMap[JobTypes.BROADCAST]>;
  [JobTypes.NOTIFICATION]: Queue<JobPayloadMap[JobTypes.NOTIFICATION]>;
  [JobTypes.CLEANUP_DATA]: Queue<JobPayloadMap[JobTypes.CLEANUP_DATA]>;
  [JobTypes.AUDIENCE_SEGMENT]: Queue<JobPayloadMap[JobTypes.AUDIENCE_SEGMENT]>;
  [JobTypes.CRON]: Queue<JobPayloadMap[JobTypes.CRON]>;
};

let queues: QueueRegistry | null = null;

const baseQueueOptions: QueueOptions = {
  prefix: "love-parser",
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
};

const redisConnectionString = config.redis.url;

function getJobDurationSeconds(job: Job): number | undefined {
  const finishedOn = typeof job.finishedOn === "number" ? job.finishedOn : Date.now();
  const startedAt = typeof job.processedOn === "number" ? job.processedOn : job.timestamp ?? finishedOn;
  const durationMs = Math.max(finishedOn - startedAt, 0);
  if (!Number.isFinite(durationMs)) {
    return undefined;
  }
  return durationMs / 1000;
}

function attachEventListeners<T>(queue: Queue<T>, jobType: JobTypes) {
  queue.on("progress", (job, progress) => {
    logger.debug(`Job progress updated`, { jobType, jobId: job.id, progress });
  });

  queue.on("completed", (job, result) => {
    logger.info(`Job completed`, { jobType, jobId: job.id, result });
    const durationSeconds = getJobDurationSeconds(job as Job);
    recordQueueJobEvent(jobType, "completed", durationSeconds);
  });

  queue.on("failed", (job, error) => {
    const durationSeconds = job ? getJobDurationSeconds(job as Job) : undefined;
    recordQueueJobEvent(jobType, "failed", durationSeconds);
    void logErrorEvent(error, {
      message: "Job failed",
      service: "queue",
      context: {
        job_id: job?.id,
        job_type: jobType,
        attempts: job?.attemptsMade,
      },
    });
  });
}

function createQueue<T>(queueName: string, jobType: JobTypes) {
  const queue = new Queue<T>(queueName, redisConnectionString, {
    ...baseQueueOptions,
    defaultJobOptions: { ...baseQueueOptions.defaultJobOptions },
  });
  void queue.isReady();
  attachEventListeners(queue, jobType);
  return queue;
}

export async function initializeQueues() {
  if (queues) {
    return queues;
  }

  queues = {
    [JobTypes.PARSE_SEARCH]: createQueue<JobPayloadMap[JobTypes.PARSE_SEARCH]>("parsing", JobTypes.PARSE_SEARCH),
    [JobTypes.BROADCAST]: createQueue<JobPayloadMap[JobTypes.BROADCAST]>("broadcast", JobTypes.BROADCAST),
    [JobTypes.NOTIFICATION]: createQueue<JobPayloadMap[JobTypes.NOTIFICATION]>("notifications", JobTypes.NOTIFICATION),
    [JobTypes.CLEANUP_DATA]: createQueue<JobPayloadMap[JobTypes.CLEANUP_DATA]>("cleanup", JobTypes.CLEANUP_DATA),
    [JobTypes.AUDIENCE_SEGMENT]: createQueue<JobPayloadMap[JobTypes.AUDIENCE_SEGMENT]>("audience", JobTypes.AUDIENCE_SEGMENT),
    [JobTypes.CRON]: createQueue<JobPayloadMap[JobTypes.CRON]>("cron", JobTypes.CRON),
  } satisfies QueueRegistry;

  await Promise.all(Object.values(queues).map((queue) => queue.isReady()));
  logger.info("Bull queues initialized");
  return queues;
}

export function getQueue<T extends JobTypes>(jobType: T): Queue<JobPayloadMap[T]> {
  if (!queues) {
    throw new Error("Queues have not been initialized");
  }

  return queues[jobType] as Queue<JobPayloadMap[T]>;
}

export function getRegisteredQueues() {
  return queues;
}

export async function closeQueues() {
  if (!queues) {
    return;
  }

  const queueEntries = Object.values(queues);
  await Promise.all(
    queueEntries.map(async (queue) => {
      try {
        await queue.close();
      } catch (error) {
        logger.error("Failed to close queue", { error });
      }
    }),
  );

  queues = null;
  logger.info("Bull queues shut down");
}
