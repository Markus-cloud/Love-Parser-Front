export interface CronJobDefinition {
  key: string;
  schedule: string;
  timezone?: string;
  description?: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  handler: () => Promise<void>;
}

export interface CronJobPayload {
  jobKey: string;
}
