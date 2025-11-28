import { Job } from "bull";

import { NotificationJob } from "@/jobs/notificationJob";
import { logger } from "@/utils/logger";

export async function handleNotificationJob(job: Job<NotificationJob>) {
  const { notificationId, userId, channel, template } = job.data;
  logger.info("Notification job started", { jobId: job.id, notificationId, channel, template });

  await job.progress(30);
  const payload = {
    notificationId,
    userId,
    channel,
    template,
    deliveredAt: new Date().toISOString(),
  };

  await job.progress(100);
  logger.info("Notification job completed", { jobId: job.id, notificationId });

  return payload;
}
