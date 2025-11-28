import type { PoolClient } from "pg";

import { CronJobDefinition } from "@/jobs/cron/types";
import { sendNotification } from "@/services/notification/notificationService";
import { pgPool } from "@/utils/clients";
import { logger } from "@/utils/logger";

const CLEANUP_THRESHOLD_DAYS = 2;

interface SubscriptionUserRow {
  user_id: string;
}

interface CleanupResult {
  parsingHistory: number;
  parsedChannels: number;
  audienceSegments: number;
  broadcastCampaigns: number;
  broadcastLogs: number;
  total: number;
}

async function findExpiredSubscriptionUserIds(): Promise<string[]> {
  const result = await pgPool.query<SubscriptionUserRow>(
    `SELECT DISTINCT user_id
     FROM subscriptions
     WHERE expires_at <= NOW() - ($1::int * INTERVAL '1 day')`,
    [CLEANUP_THRESHOLD_DAYS],
  );

  return result.rows.map((row) => row.user_id);
}

async function cleanupUserData(userId: string): Promise<CleanupResult> {
  const client = await pgPool.connect();

  try {
    await client.query("BEGIN");

    const parsedChannels = await deleteParsedChannels(userId, client);
    const parsingHistory = await client.query(
      `DELETE FROM parsing_history WHERE user_id = $1 RETURNING id`,
      [userId],
    );
    const audienceSegments = await client.query(
      `DELETE FROM audience_segments WHERE user_id = $1 RETURNING id`,
      [userId],
    );
    const broadcastLogs = await deleteBroadcastLogs(userId, client);
    const broadcastCampaigns = await client.query(
      `DELETE FROM broadcast_campaigns WHERE user_id = $1 RETURNING id`,
      [userId],
    );

    await client.query("COMMIT");

    const counts = {
      parsingHistory: parsingHistory.rowCount ?? 0,
      parsedChannels: parsedChannels.rowCount ?? 0,
      audienceSegments: audienceSegments.rowCount ?? 0,
      broadcastCampaigns: broadcastCampaigns.rowCount ?? 0,
      broadcastLogs: broadcastLogs.rowCount ?? 0,
    } satisfies Omit<CleanupResult, "total">;

    return {
      ...counts,
      total:
        counts.parsingHistory +
        counts.parsedChannels +
        counts.audienceSegments +
        counts.broadcastCampaigns +
        counts.broadcastLogs,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteParsedChannels(userId: string, client: PoolClient) {
  return client.query(
    `DELETE FROM parsed_channels
     WHERE parsing_history_id IN (
       SELECT id
       FROM parsing_history
       WHERE user_id = $1
     )
     RETURNING id`,
    [userId],
  );
}

async function deleteBroadcastLogs(userId: string, client: PoolClient) {
  return client.query(
    `DELETE FROM broadcast_logs
     WHERE campaign_id IN (
       SELECT id
       FROM broadcast_campaigns
       WHERE user_id = $1
     )
     RETURNING id`,
    [userId],
  );
}

export const subscriptionCleanupJob: CronJobDefinition = {
  key: "subscription-cleanup",
  schedule: "0 2 * * *",
  timezone: "UTC",
  description: "Removes user-generated data for subscriptions expired for 2+ days",
  maxAttempts: 3,
  retryDelayMs: 60_000,
  handler: async () => {
    const expiredUserIds = await findExpiredSubscriptionUserIds();

    if (expiredUserIds.length === 0) {
      logger.info("Subscription cleanup job completed - no expired users detected");
      return;
    }

    let totalRecordsRemoved = 0;
    let notifiedUsers = 0;

    for (const userId of expiredUserIds) {
      const result = await cleanupUserData(userId);
      totalRecordsRemoved += result.total;

      logger.info("Expired subscription data removed", { userId, ...result });

      if (result.total === 0) {
        continue;
      }

      try {
        await sendNotification({
          userId,
          template: "DATA_REMOVAL",
          metadata: {
            source: "subscription-cleanup",
            removedRecords: result.total,
          },
        });
        notifiedUsers += 1;
      } catch (error) {
        logger.warn("Failed to send cleanup notification", { userId, error });
      }
    }

    logger.info("Subscription cleanup summary", {
      processedUsers: expiredUserIds.length,
      totalRecordsRemoved,
      notificationsSent: notifiedUsers,
    });
  },
};
