import { pgPool } from "@/utils/clients";
import { RateLimitError } from "@/utils/errors";

const BROADCAST_CAMPAIGN_LIMIT_KEY = "broadcast_campaigns" as const;
const BROADCAST_MESSAGE_LIMIT_KEY = "broadcast_messages" as const;

type UsageLimitRow = {
  id: string;
  limit_key: string;
  limit_value: number | null;
  consumed_value: number | null;
};

async function findLimitRow(userId: string, limitKey: string): Promise<UsageLimitRow | null> {
  const result = await pgPool.query<UsageLimitRow>(
    `SELECT id, limit_key, limit_value, consumed_value
     FROM usage_limits
     WHERE user_id = $1 AND limit_key = $2
     LIMIT 1`,
    [userId, limitKey],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

function assertLimitAvailable(limitRow: UsageLimitRow | null, required = 1) {
  if (!limitRow) {
    return;
  }

  const limitValue = limitRow.limit_value ?? 0;
  if (limitValue <= 0) {
    return;
  }

  const consumedValue = limitRow.consumed_value ?? 0;
  if (consumedValue + required > limitValue) {
    throw new RateLimitError("Broadcast limit exceeded", {
      details: { limit: limitValue, used: consumedValue, required },
    });
  }
}

async function incrementUsage(limitRow: UsageLimitRow | null, amount: number) {
  if (!limitRow) {
    return;
  }

  const limitValue = limitRow.limit_value ?? 0;
  if (limitValue <= 0) {
    return;
  }

  const incrementBy = Math.max(1, Math.floor(amount));

  await pgPool.query(
    `UPDATE usage_limits
     SET consumed_value = LEAST(limit_value, COALESCE(consumed_value, 0) + $2), updated_at = NOW()
     WHERE id = $1`,
    [limitRow.id, incrementBy],
  );
}

export async function assertBroadcastCampaignQuotaAvailable(userId: string) {
  const limitRow = await findLimitRow(userId, BROADCAST_CAMPAIGN_LIMIT_KEY);
  assertLimitAvailable(limitRow, 1);
}

export async function incrementBroadcastCampaignUsage(userId: string, amount = 1) {
  const limitRow = await findLimitRow(userId, BROADCAST_CAMPAIGN_LIMIT_KEY);
  await incrementUsage(limitRow, amount);
}

export async function assertBroadcastMessageQuotaAvailable(userId: string, required: number) {
  if (!Number.isFinite(required) || required <= 0) {
    return;
  }

  const limitRow = await findLimitRow(userId, BROADCAST_MESSAGE_LIMIT_KEY);
  assertLimitAvailable(limitRow, Math.max(1, Math.floor(required)));
}

export async function incrementBroadcastMessageUsage(userId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const limitRow = await findLimitRow(userId, BROADCAST_MESSAGE_LIMIT_KEY);
  await incrementUsage(limitRow, amount);
}
