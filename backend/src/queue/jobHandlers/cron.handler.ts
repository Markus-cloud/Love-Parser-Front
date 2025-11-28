import { Job } from "bull";

import { getCronJobByKey } from "@/jobs/cron";
import { CronJobPayload } from "@/jobs/cron/types";
import { cronJobDurationHistogram, cronJobResultCounter } from "@/monitoring/prometheus";
import { logger } from "@/utils/logger";

export async function handleCronJob(job: Job<CronJobPayload>) {
  const jobKey = job.data?.jobKey;

  if (!jobKey) {
    logger.warn("Cron job received without key", { jobId: job.id });
    return;
  }

  const cronJobDefinition = getCronJobByKey(jobKey);

  if (!cronJobDefinition) {
    logger.warn("Unknown cron job key", { jobId: job.id, jobKey });
    return;
  }

  logger.info("Cron job started", { jobId: job.id, jobKey });
  const stopTimer = cronJobDurationHistogram.startTimer({ job_name: jobKey });

  try {
    await job.progress(10);
    await cronJobDefinition.handler();
    await job.progress(100);
    cronJobResultCounter.labels(jobKey, "success").inc();
    logger.info("Cron job completed", { jobId: job.id, jobKey });
  } catch (error) {
    cronJobResultCounter.labels(jobKey, "failure").inc();
    logger.error("Cron job failed", { jobId: job.id, jobKey, error });
    throw error;
  } finally {
    stopTimer();
  }
}
