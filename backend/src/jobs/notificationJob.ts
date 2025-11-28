export type NotificationChannel = "telegram" | "email" | "in_app";

export type NotificationTemplate = "DATA_REMOVAL" | "SUBSCRIPTION_EXPIRING" | "PAYMENT_PENDING_REMINDER";

export interface NotificationJob {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  template: NotificationTemplate;
  message: string;
  metadata?: Record<string, unknown>;
}
