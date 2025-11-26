import { BroadcastJob } from "@/jobs/broadcastJob";
import { CleanupDataJob } from "@/jobs/cleanupDataJob";
import { NotificationJob } from "@/jobs/notificationJob";
import { ParseSearchJob } from "@/jobs/parseSearchJob";

export enum JobTypes {
  PARSE_SEARCH = "parse-search",
  BROADCAST = "broadcast",
  NOTIFICATION = "notification",
  CLEANUP_DATA = "cleanup-data",
}

export type JobPayloadMap = {
  [JobTypes.PARSE_SEARCH]: ParseSearchJob;
  [JobTypes.BROADCAST]: BroadcastJob;
  [JobTypes.NOTIFICATION]: NotificationJob;
  [JobTypes.CLEANUP_DATA]: CleanupDataJob;
};

export type JobPayload<T extends JobTypes> = JobPayloadMap[T];
