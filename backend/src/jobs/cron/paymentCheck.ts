import { CronJobDefinition } from "@/jobs/cron/types";
import { sendNotification } from "@/services/notification/notificationService";
import { pgPool } from "@/utils/clients";
import { logger } from "@/utils/logger";

interface PaymentRow {
  id: string;
  user_id: string;
  transaction_id: string;
  created_at: Date;
}

const REMINDER_THRESHOLD_MINUTES = 30;
const FAILURE_THRESHOLD_HOURS = 24;

async function failOverduePayments(): Promise<number> {
  const result = await pgPool.query(
    `UPDATE payments
     SET status = 'failed',
         payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
           'failure_reason', 'pending_timeout',
           'failed_at', NOW()
         )
     WHERE status = 'pending'
       AND created_at <= NOW() - ($1::int * INTERVAL '1 hour')
     RETURNING id, user_id, transaction_id`,
    [FAILURE_THRESHOLD_HOURS],
  );

  if (result.rowCount > 0) {
    logger.info("Marked overdue payments as failed", {
      count: result.rowCount,
    });
  }

  return result.rowCount ?? 0;
}

async function fetchPaymentsNeedingReminder(): Promise<PaymentRow[]> {
  const result = await pgPool.query<PaymentRow>(
    `SELECT id, user_id, transaction_id, created_at
     FROM payments
     WHERE status = 'pending'
       AND created_at <= NOW() - ($1::int * INTERVAL '1 minute')
       AND created_at > NOW() - ($2::int * INTERVAL '1 hour')
       AND COALESCE(payload->>'pending_reminder_sent_at', '') = ''
     ORDER BY created_at ASC`,
    [REMINDER_THRESHOLD_MINUTES, FAILURE_THRESHOLD_HOURS],
  );

  return result.rows;
}

async function markReminderSent(paymentId: string, timestamp: string) {
  await pgPool.query(
    `UPDATE payments
     SET payload = COALESCE(payload, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [paymentId, JSON.stringify({ pending_reminder_sent_at: timestamp })],
  );
}

export const paymentCheckJob: CronJobDefinition = {
  key: "payment-check",
  schedule: "*/5 * * * *",
  timezone: "UTC",
  description: "Checks pending payments every 5 minutes",
  handler: async () => {
    const failedPayments = await failOverduePayments();
    const paymentsNeedingReminder = await fetchPaymentsNeedingReminder();

    if (paymentsNeedingReminder.length === 0) {
      logger.info("Payment check job completed", {
        overdueMarkedFailed: failedPayments,
        remindersSent: 0,
      });
      return;
    }

    let remindersSent = 0;

    for (const payment of paymentsNeedingReminder) {
      const sentAt = new Date().toISOString();
      try {
        await sendNotification({
          userId: payment.user_id,
          template: "PAYMENT_PENDING_REMINDER",
          metadata: {
            paymentId: payment.id,
            transactionId: payment.transaction_id,
          },
        });
        await markReminderSent(payment.id, sentAt);
        remindersSent += 1;
      } catch (error) {
        logger.warn("Failed to send payment reminder", {
          paymentId: payment.id,
          userId: payment.user_id,
          error,
        });
      }
    }

    logger.info("Payment check summary", {
      pendingPaymentsChecked: paymentsNeedingReminder.length,
      remindersSent,
      overdueMarkedFailed: failedPayments,
    });
  },
};
