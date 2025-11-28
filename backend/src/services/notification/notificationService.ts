import { randomUUID } from "node:crypto";

import { NotificationChannel, NotificationJob, NotificationTemplate } from "@/jobs/notificationJob";
import { JobTypes } from "@/jobs/jobTypes";
import { addJob } from "@/utils/queueHelpers";
import { logger } from "@/utils/logger";

const CHANNEL_PRIORITY: NotificationChannel[] = ["telegram", "email", "in_app"];

export interface NotificationContext {
  expiresAt?: string | Date;
  paymentId?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SendNotificationInput {
  userId: string;
  template: NotificationTemplate;
  preferredChannel?: NotificationChannel | null;
  metadata?: Record<string, unknown>;
  context?: NotificationContext;
}

export interface SendNotificationResult {
  notificationId: string;
  channel: NotificationChannel;
}

function buildMetadata(metadata?: Record<string, unknown>, context?: NotificationContext): Record<string, unknown> | undefined {
  const compiled: Record<string, unknown> = {
    ...(metadata ?? {}),
  };

  const normalizedContext = normalizeContext(context);
  if (normalizedContext) {
    const existingContextValue = compiled.context;
    const existingContext =
      typeof existingContextValue === "object" && existingContextValue !== null
        ? (existingContextValue as Record<string, unknown>)
        : {};
    compiled.context = {
      ...existingContext,
      ...normalizedContext,
    };
  }

  return Object.keys(compiled).length > 0 ? compiled : undefined;
}

function normalizeContext(context?: NotificationContext): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const normalized: Record<string, unknown> = { ...context };

  if (context.expiresAt) {
    normalized.expiresAt = formatDate(context.expiresAt);
  } else if ("expiresAt" in normalized) {
    delete normalized.expiresAt;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function formatDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

export function formatNotificationMessage(template: NotificationTemplate, context?: NotificationContext): string {
  switch (template) {
    case "DATA_REMOVAL":
      return "Ваши данные удалены";
    case "SUBSCRIPTION_EXPIRING": {
      const expiresAt = context?.expiresAt ? formatDate(context.expiresAt) : null;
      return expiresAt ? `Your subscription expires in 24 hours (on ${expiresAt})` : "Your subscription expires in 24 hours";
    }
    case "PAYMENT_PENDING_REMINDER":
      return "Your payment is still pending";
    default:
      return "You have a new notification";
  }
}

export function getNotificationChannel(preferredChannel?: NotificationChannel | null): NotificationChannel {
  if (preferredChannel && CHANNEL_PRIORITY.includes(preferredChannel)) {
    return preferredChannel;
  }

  return CHANNEL_PRIORITY[0];
}

export async function sendNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
  const notificationId = randomUUID();
  const channel = getNotificationChannel(input.preferredChannel);
  const message = formatNotificationMessage(input.template, input.context);
  const metadata = buildMetadata(input.metadata, input.context);

  const jobPayload: NotificationJob = {
    notificationId,
    userId: input.userId,
    channel,
    template: input.template,
    message,
    ...(metadata ? { metadata } : {}),
  };

  await addJob(JobTypes.NOTIFICATION, jobPayload);
  logger.info("Notification queued", {
    notificationId,
    userId: input.userId,
    template: input.template,
    channel,
  });

  return { notificationId, channel };
}
