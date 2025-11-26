import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  JWT_SECRET: z.string().min(10).default("changeme-secret"),
  POSTGRES_URL: z.string().url().default("postgresql://love_parser:love_parser@localhost:5432/love_parser"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  TELEGRAM_API_ID: z.coerce.number().default(0),
  TELEGRAM_API_HASH: z.string().default(""),
  TELEGRAM_SESSION: z.string().default(""),
});

export const env = envSchema.parse(process.env);
