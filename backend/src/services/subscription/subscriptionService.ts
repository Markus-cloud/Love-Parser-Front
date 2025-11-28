import type { Pool, PoolClient } from "pg";

import { pgPool } from "@/utils/clients";
import { NotFoundError, ValidationError } from "@/utils/errors";

export type SubscriptionPlanType = "free" | "week" | "month" | "year";

export interface SubscriptionPlanLimits {
  parsing: number;
  audience: number;
  broadcast: number;
}

export interface SubscriptionPlan {
  type: SubscriptionPlanType;
  name: string;
  price: number;
  currency: "RUB";
  durationDays: number;
  limits: SubscriptionPlanLimits;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planCode: string;
  planName: string;
  status: string;
  startedAt: Date;
  expiresAt: Date;
  metadata: Record<string, unknown> | null;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_code: string;
  plan_name: string;
  status: string;
  started_at: Date;
  expires_at: Date;
  metadata: unknown;
}

interface UsageLimitRowInput {
  userId: string;
  limitKey: string;
  limitValue: number;
  resetsAt?: Date;
}

const MILLISECONDS_IN_DAY = 86_400_000;

const SUBSCRIPTION_PLAN_DEFINITIONS: Record<SubscriptionPlanType, SubscriptionPlan> = {
  free: {
    type: "free",
    name: "Бесплатный",
    price: 0,
    currency: "RUB",
    durationDays: 30,
    limits: {
      parsing: 1,
      audience: 1,
      broadcast: 0,
    },
  },
  week: {
    type: "week",
    name: "Неделя",
    price: 450,
    currency: "RUB",
    durationDays: 7,
    limits: {
      parsing: 10,
      audience: 10,
      broadcast: 10,
    },
  },
  month: {
    type: "month",
    name: "Месяц",
    price: 950,
    currency: "RUB",
    durationDays: 30,
    limits: {
      parsing: 50,
      audience: 50,
      broadcast: 50,
    },
  },
  year: {
    type: "year",
    name: "Год",
    price: 5_750,
    currency: "RUB",
    durationDays: 365,
    limits: {
      parsing: -1,
      audience: -1,
      broadcast: -1,
    },
  },
};

const PLAN_ORDER: SubscriptionPlanType[] = ["free", "week", "month", "year"];

const LIMIT_KEY_MAPPINGS: Record<keyof SubscriptionPlanLimits, string[]> = {
  parsing: ["searches_per_day", "parsing_requests", "parsing_channels"],
  audience: ["audience_segments", "audience_searches", "audience_exports"],
  broadcast: ["broadcast_campaigns", "broadcast_messages"],
};

type Queryable = Pool | PoolClient;

function resolveClient(client?: Queryable): Queryable {
  return client ?? pgPool;
}

function clonePlan(plan: SubscriptionPlan): SubscriptionPlan {
  return {
    ...plan,
    limits: { ...plan.limits },
  };
}

function mapSubscriptionRow(row: SubscriptionRow): SubscriptionRecord {
  let metadata: Record<string, unknown> | null = null;

  if (row.metadata) {
    if (typeof row.metadata === "object") {
      metadata = row.metadata as Record<string, unknown>;
    } else if (typeof row.metadata === "string") {
      try {
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        metadata = null;
      }
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    planCode: row.plan_code,
    planName: row.plan_name,
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    metadata,
  };
}

function addDays(base: Date, days: number) {
  if (!Number.isFinite(days) || days <= 0) {
    return new Date(base.getTime() + MILLISECONDS_IN_DAY);
  }

  return new Date(base.getTime() + days * MILLISECONDS_IN_DAY);
}

function serializeMetadata(metadata?: Record<string, unknown> | null) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return "{}";
  }

  return JSON.stringify(metadata);
}

export function getAvailablePlans(): SubscriptionPlan[] {
  return PLAN_ORDER.map((type) => clonePlan(SUBSCRIPTION_PLAN_DEFINITIONS[type]));
}

export function getPlanByType(planType: SubscriptionPlanType): SubscriptionPlan {
  const plan = SUBSCRIPTION_PLAN_DEFINITIONS[planType];
  if (!plan) {
    throw new ValidationError("Unsupported subscription plan", { planType });
  }

  return clonePlan(plan);
}

export interface CreateSubscriptionInput {
  userId: string;
  planCode: string;
  planName: string;
  durationDays?: number;
  status?: string;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
  expiresAt?: Date;
}

export async function createSubscription(input: CreateSubscriptionInput, client?: Queryable): Promise<SubscriptionRecord> {
  const queryable = resolveClient(client);
  const startedAt = input.startedAt ?? new Date();
  const durationDays = input.durationDays && input.durationDays > 0 ? input.durationDays : 30;
  const expiresAt = input.expiresAt ?? addDays(startedAt, durationDays);

  const result = await queryable.query<SubscriptionRow>(
    `INSERT INTO subscriptions (user_id, plan_code, plan_name, status, started_at, expires_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, user_id, plan_code, plan_name, status, started_at, expires_at, metadata`,
    [
      input.userId,
      input.planCode,
      input.planName,
      input.status ?? "active",
      startedAt,
      expiresAt,
      serializeMetadata(input.metadata),
    ],
  );

  return mapSubscriptionRow(result.rows[0]);
}

export interface UpdateSubscriptionInput {
  planCode?: string;
  planName?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
  expiresAt?: Date;
}

export async function updateSubscription(
  subscriptionId: string,
  updates: UpdateSubscriptionInput,
  client?: Queryable,
): Promise<SubscriptionRecord> {
  const queryable = resolveClient(client);
  const sets: string[] = [];
  const values: unknown[] = [subscriptionId];
  let index = 2;

  if (updates.planCode) {
    sets.push(`plan_code = $${index}`);
    values.push(updates.planCode);
    index += 1;
  }

  if (updates.planName) {
    sets.push(`plan_name = $${index}`);
    values.push(updates.planName);
    index += 1;
  }

  if (updates.status) {
    sets.push(`status = $${index}`);
    values.push(updates.status);
    index += 1;
  }

  if (updates.startedAt) {
    sets.push(`started_at = $${index}`);
    values.push(updates.startedAt);
    index += 1;
  }

  if (updates.expiresAt) {
    sets.push(`expires_at = $${index}`);
    values.push(updates.expiresAt);
    index += 1;
  }

  if (updates.metadata) {
    sets.push(`metadata = $${index}::jsonb`);
    values.push(serializeMetadata(updates.metadata));
    index += 1;
  }

  if (sets.length === 0) {
    throw new ValidationError("No subscription fields provided for update");
  }

  sets.push("updated_at = NOW()");

  const result = await queryable.query<SubscriptionRow>(
    `UPDATE subscriptions
     SET ${sets.join(", ")}
     WHERE id = $1
     RETURNING id, user_id, plan_code, plan_name, status, started_at, expires_at, metadata`,
    values,
  );

  if (result.rowCount === 0) {
    throw new NotFoundError("Subscription not found", { subscriptionId });
  }

  return mapSubscriptionRow(result.rows[0]);
}

export async function getSubscriptionByUserId(userId: string, client?: Queryable): Promise<SubscriptionRecord | null> {
  const queryable = resolveClient(client);
  const result = await queryable.query<SubscriptionRow>(
    `SELECT id, user_id, plan_code, plan_name, status, started_at, expires_at, metadata
     FROM subscriptions
     WHERE user_id = $1
     ORDER BY expires_at DESC
     LIMIT 1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapSubscriptionRow(result.rows[0]);
}

export function checkSubscriptionExpired(subscription: SubscriptionRecord | null | undefined): boolean {
  if (!subscription) {
    return true;
  }

  const expiresAtTime = subscription.expiresAt instanceof Date ? subscription.expiresAt.getTime() : 0;
  const status = subscription.status?.toLowerCase();
  if (!expiresAtTime || expiresAtTime <= Date.now()) {
    return true;
  }

  return status !== "active" && status !== "trialing";
}

export function calculatePlanExpiration(
  subscription: SubscriptionRecord | null,
  plan: SubscriptionPlan,
): { startsAt: Date; expiresAt: Date } {
  const now = new Date();
  const shouldExtend = subscription && subscription.expiresAt && subscription.expiresAt.getTime() > now.getTime();
  const base = shouldExtend ? subscription!.expiresAt : now;
  const expiresAt = addDays(base, plan.durationDays);

  return { startsAt: now, expiresAt };
}

async function upsertUsageLimit({ userId, limitKey, limitValue, resetsAt }: UsageLimitRowInput, client?: Queryable) {
  const queryable = resolveClient(client);

  await queryable.query(
    `INSERT INTO usage_limits (user_id, limit_key, limit_value, consumed_value, resets_at)
     VALUES ($1, $2, $3, 0, $4)
     ON CONFLICT (user_id, limit_key)
     DO UPDATE SET
       limit_value = EXCLUDED.limit_value,
       consumed_value = 0,
       resets_at = EXCLUDED.resets_at,
       updated_at = NOW()`,
    [userId, limitKey, limitValue, resetsAt ?? null],
  );
}

export async function applyUsageLimitsForPlan(
  userId: string,
  plan: SubscriptionPlan,
  expiresAt: Date,
  client?: Queryable,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  (Object.keys(plan.limits) as (keyof SubscriptionPlanLimits)[]).forEach((category) => {
    const limitValue = plan.limits[category];
    const limitKeys = LIMIT_KEY_MAPPINGS[category] ?? [];

    for (const limitKey of limitKeys) {
      tasks.push(upsertUsageLimit({ userId, limitKey, limitValue, resetsAt: expiresAt }, client));
    }
  });

  await Promise.all(tasks);
}
