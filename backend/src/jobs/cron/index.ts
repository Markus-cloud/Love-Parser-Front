import { errorLogCleanupJob } from "@/jobs/cron/errorLogCleanup";
import { paymentCheckJob } from "@/jobs/cron/paymentCheck";
import { subscriptionCleanupJob } from "@/jobs/cron/subscriptionCleanup";
import { subscriptionExpirationJob } from "@/jobs/cron/subscriptionExpiration";
import { CronJobDefinition } from "@/jobs/cron/types";

export const cronJobs: CronJobDefinition[] = [
  subscriptionCleanupJob,
  subscriptionExpirationJob,
  paymentCheckJob,
  errorLogCleanupJob,
];

const cronJobMap = new Map(cronJobs.map((job) => [job.key, job]));

export function getCronJobByKey(key: string): CronJobDefinition | undefined {
  return cronJobMap.get(key);
}
