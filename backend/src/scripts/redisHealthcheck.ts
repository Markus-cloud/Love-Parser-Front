import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/1";
const timeoutMs = Number(process.env.REDIS_HEALTHCHECK_TIMEOUT_MS ?? 30_000);

async function redisHealthcheck() {
  const timeout = setTimeout(() => {
    console.error(`Redis healthcheck timed out after ${timeoutMs}ms`);
    process.exit(1);
  }, timeoutMs);

  const client = createClient({ url: redisUrl });
  client.on("error", (error) => {
    console.error("Redis client error", error);
  });

  try {
    await client.connect();
    const response = await client.ping();
    if (response !== "PONG") {
      throw new Error(`Unexpected Redis response: ${response}`);
    }
    console.info("✅ Redis responded to PING");
  } finally {
    clearTimeout(timeout);
    await client.quit().catch(() => undefined);
  }
}

redisHealthcheck().catch((error) => {
  console.error("❌ Redis healthcheck failed", error);
  process.exit(1);
});
