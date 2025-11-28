import fs from "node:fs";
import path from "node:path";

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
