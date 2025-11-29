import fs from "node:fs";
import path from "node:path";

import * as Sentry from "@sentry/node";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

import { config } from "@/config/config";

const LOG_DIRECTORY = path.resolve(process.cwd(), "logs");

if (!fs.existsSync(LOG_DIRECTORY)) {
  fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
}

const logLevel = config.nodeEnv === "production" ? "info" : "debug";

const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ["message", "level", "timestamp", "service"] }),
  winston.format.json(),
);

const transports: winston.transport[] = [
  new winston.transports.File({
    filename: path.join(LOG_DIRECTORY, "app.log"),
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
    level: "info",
  }),
  new DailyRotateFile({
    filename: path.join(LOG_DIRECTORY, "app-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxFiles: "14d",
    level: "info",
  }),
];

const sentryEnabled = Boolean(config.monitoring?.sentryDsn);

if (sentryEnabled) {
  Sentry.init({
    dsn: config.monitoring?.sentryDsn ?? undefined,
    environment: config.nodeEnv,
    tracesSampleRate: config.nodeEnv === "production" ? 0.1 : 1,
  });
}

if (config.nodeEnv !== "production") {
  transports.push(
    new winston.transports.Console({
      level: "debug",
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "HH:mm:ss" }),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const context = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
          return `${timestamp} [${level}] ${message}${context}`;
        }),
      ),
    }),
  );
}

export const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: "love-parser-backend" },
  format: jsonFormat,
  transports,
});

export function captureWithSentry(error: Error, context?: Record<string, unknown>) {
  if (!sentryEnabled) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        if (value === undefined) {
          return;
        }

        if (value !== null && typeof value === "object") {
          scope.setContext(key, value as Record<string, unknown>);
        } else {
          scope.setExtra(key, value as string | number | boolean | null);
        }
      });

      if (typeof context.service === "string") {
        scope.setTag("service", context.service);
      }
    }

    Sentry.captureException(error);
  });
}
