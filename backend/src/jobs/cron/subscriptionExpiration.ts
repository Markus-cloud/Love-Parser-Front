import { CronJobDefinition } from "@/jobs/cron/types";
import { sendNotification } from "@/services/notification/notificationService";
import { pgPool } from "@/utils/clients";
import { logger } from "@/utils/logger";

interface SubscriptionRow {
  id: string;
  user_id: string;
  expires_at: Date;
}

const EXPIRATION_NOTICE_WINDOW_START_HOURS = 24;
const EXPIRATION_NOTICE_WINDOW_END_HOURS = 25;

async function fetchExpiringSubscriptions(): Promise<SubscriptionRow[]> {
  const result = await pgPool.query<SubscriptionRow>(
    `SELECT id, user_id, expires_at
     FROM subscriptions
     WHERE status = 'active'
       AND expires_at BETWEEN NOW() + ($1::int * INTERVAL '1 hour') AND NOW() + ($2::int * INTERVAL '1 hour')
     ORDER BY expires_at ASC`,
    [EXPIRATION_NOTICE_WINDOW_START_HOURS, EXPIRATION_NOTICE_WINDOW_END_HOURS],
  );

  return result.rows;
}

export const subscriptionExpirationJob: CronJobDefinition = {
  key: "subscription-expiration",
  schedule: "0 1 * * *",
  timezone: "UTC",
  description: "Sends reminders 24 hours before subscription expiry",
  handler: async () => {
    const subscriptions = await fetchExpiringSubscriptions();

    if (subscriptions.length === 0) {
      logger.info("Subscription expiration job completed - nothing to notify");
      return;
    }

    let notificationsSent = 0;

    for (const subscription of subscriptions) {
      try {
        await sendNotification({
          userId: subscription.user_id,
          template: "SUBSCRIPTION_EXPIRING",
          context: {
            expiresAt: subscription.expires_at,
          },
          metadata: {
            subscriptionId: subscription.id,
            expiresAt: subscription.expires_at?.toISOString?.() ?? null,
          },
        });
        notificationsSent += 1;
      } catch (error) {
        logger.warn("Failed to send expiration notification", {
          subscriptionId: subscription.id,
          userId: subscription.user_id,
          error,
        });
      }
    }

    logger.info("Subscription expiration summary", {
      processedSubscriptions: subscriptions.length,
      notificationsSent,
    });
  },
};
