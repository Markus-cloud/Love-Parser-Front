import { Client } from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://love_parser:love_parser@127.0.0.1:5432/test-loveparser";
const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS ?? 60_000);
const retryDelayMs = Number(process.env.DB_WAIT_INTERVAL_MS ?? 2_000);

async function sleep(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function waitForDatabase() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("SELECT 1");
      console.info("✅ PostgreSQL is ready for connections");
      await client.end();
      return;
    } catch (error) {
      console.warn("PostgreSQL is not ready yet, retrying...", (error as Error).message);
      await client.end().catch(() => undefined);
      await sleep(retryDelayMs);
    }
  }

  throw new Error(`Database was not ready within ${timeoutMs}ms`);
}

waitForDatabase().catch((error) => {
  console.error("❌ Failed to reach PostgreSQL", error);
  process.exit(1);
});
