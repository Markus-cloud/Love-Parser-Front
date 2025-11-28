import { AudienceSegmentJob } from "@/jobs/audienceJob";
import { BroadcastJob } from "@/jobs/broadcastJob";
import { CleanupDataJob } from "@/jobs/cleanupDataJob";
import { CronJobPayload } from "@/jobs/cron/types";
import { NotificationJob } from "@/jobs/notificationJob";
import { ParseSearchJob } from "@/jobs/parseSearchJob";

export enum JobTypes {
  PARSE_SEARCH = "parse-search",
  BROADCAST = "broadcast",
  NOTIFICATION = "notification",
  CLEANUP_DATA = "cleanup-data",
  AUDIENCE_SEGMENT = "audience-segment",
  CRON = "cron",
}

export type JobPayloadMap = {
  [JobTypes.PARSE_SEARCH]: ParseSearchJob;
  [JobTypes.BROADCAST]: BroadcastJob;
  [JobTypes.NOTIFICATION]: NotificationJob;
  [JobTypes.CLEANUP_DATA]: CleanupDataJob;
  [JobTypes.AUDIENCE_SEGMENT]: AudienceSegmentJob;
  [JobTypes.CRON]: CronJobPayload;
};

export type JobPayload<T extends JobTypes> = JobPayloadMap[T];
