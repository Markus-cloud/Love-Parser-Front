import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { env } from "@utils/env";

let telegramClient: TelegramClient | null = null;

function createTelegramClient() {
  if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH) {
    throw new Error("Telegram credentials are not configured");
  }

  const session = new StringSession(env.TELEGRAM_SESSION);
  telegramClient = new TelegramClient(session, env.TELEGRAM_API_ID, env.TELEGRAM_API_HASH, {
    connectionRetries: 5,
  });

  return telegramClient;
}

export async function ensureTelegramClient() {
  const client = telegramClient ?? createTelegramClient();

  if (!client.connected) {
    await client.connect();
  }

  return client;
}
