import { CronJobDefinition } from "@/jobs/cron/types";
import { pgPool } from "@/utils/clients";
import { logger } from "@/utils/logger";

const ERROR_LOG_RETENTION_DAYS = 2;

export const errorLogCleanupJob: CronJobDefinition = {
  key: "error-log-cleanup",
  schedule: "0 3 * * *",
  timezone: "UTC",
  description: "Removes expired error logs every night",
  handler: async () => {
    const result = await pgPool.query(
      `DELETE FROM error_logs
       WHERE created_at <= NOW() - ($1::int * INTERVAL '1 day')
          OR expires_at <= NOW()
       RETURNING id`,
      [ERROR_LOG_RETENTION_DAYS],
    );

    logger.info("Error log cleanup summary", {
      removedRecords: result.rowCount ?? 0,
    });
  },
};
