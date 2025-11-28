import { randomUUID } from "node:crypto";

import { FastifyInstance } from "fastify";
import { z } from "zod";

import { generatePaymentURL, getMerchantConfig, verifySignature, formatRobokassaAmount } from "@/integrations/robokassa";
import { getCurrentUser } from "@/middleware/getCurrentUser";
import { validateRequest } from "@/middleware/validateRequest";
import { verifyJWT } from "@/middleware/verifyJWT";
import { invalidateDashboardCache } from "@/services/dashboard/dashboard.service";
import {
  SubscriptionPlan,
  SubscriptionPlanType,
  SubscriptionRecord,
  applyUsageLimitsForPlan,
  calculatePlanExpiration,
  checkSubscriptionExpired,
  createSubscription,
  getAvailablePlans,
  getPlanByType,
  getSubscriptionByUserId,
  updateSubscription,
} from "@/services/subscription/subscriptionService";
import { pgPool } from "@/utils/clients";
import { AppError, AuthError, ForbiddenError, NotFoundError, ValidationError, HTTP_STATUS } from "@/utils/errors";

type PaidPlanType = Exclude<SubscriptionPlanType, "free">;
const PAID_PLAN_TYPES = ["week", "month", "year"] as const satisfies readonly PaidPlanType[];

const purchaseSchema = z.object({
  plan_type: z.enum(PAID_PLAN_TYPES),
});

type PurchaseBody = z.infer<typeof purchaseSchema>;

const webhookSchema = z.object({
  MerchantLogin: z.string().min(1),
  SignatureValue: z.string().min(1),
  InvId: z.string().min(1),
  OutSum: z.union([z.string(), z.number()]).optional(),
  Sum: z.union([z.string(), z.number()]).optional(),
  Culture: z.string().optional(),
  IsTest: z.union([z.string(), z.number()]).optional(),
});

type RobokassaWebhookBody = z.infer<typeof webhookSchema>;

interface PaymentRow {
  id: string;
  user_id: string;
  status: string;
  payload: unknown;
  subscription_id: string | null;
}

function formatPlanResponse(plan: SubscriptionPlan) {
  return {
    type: plan.type,
    name: plan.name,
    price: plan.price,
    currency: plan.currency,
    limits: { ...plan.limits },
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

function resolveAutoRenewFlag(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) {
    return false;
  }

  const directValue = metadata.autoRenew ?? metadata.auto_renew ?? metadata.renewal;

  if (typeof directValue === "boolean") {
    return directValue;
  }

  if (typeof directValue === "number") {
    return directValue !== 0;
  }

  if (typeof directValue === "string") {
    const normalized = directValue.trim().toLowerCase();
    if (normalized === "auto" || normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
  }

  return false;
}

function buildCurrentSubscriptionResponse(subscription: SubscriptionRecord | null) {
  if (!subscription) {
    return {
      plan_type: "free",
      status: "expired",
      expires_at: null,
      renewal_status: "manual",
      auto_renewal_enabled: false,
    };
  }

  const expired = checkSubscriptionExpired(subscription);
  const autoRenew = resolveAutoRenewFlag(subscription.metadata);
  const renewalStatus = expired ? "expired" : autoRenew ? "auto" : "manual";

  return {
    plan_type: subscription.planCode ?? "free",
    status: expired ? "expired" : "active",
    expires_at: subscription.expiresAt?.toISOString?.() ?? null,
    renewal_status: renewalStatus,
    auto_renewal_enabled: autoRenew,
  };
}

function extractPlanType(payload: Record<string, unknown> | null): SubscriptionPlanType {
  const planType = payload?.plan_type;
  if (typeof planType !== "string") {
    throw new ValidationError("Payment metadata is missing plan type");
  }

  return planType as SubscriptionPlanType;
}

async function persistPayment(orderId: string, plan: SubscriptionPlan, userId: string) {
  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO payments (user_id, amount, currency, status, provider, transaction_id, payload)
     VALUES ($1, $2, $3, 'pending', 'robokassa', $4, $5::jsonb)
     RETURNING id`,
    [
      userId,
      plan.price,
      plan.currency,
      orderId,
      JSON.stringify({ plan_type: plan.type, plan_name: plan.name, price: plan.price }),
    ],
  );

  return result.rows[0].id;
}

export async function registerSubscriptionRoutes(app: FastifyInstance) {
  app.get("/plans", async () => {
    const plans = getAvailablePlans().map((plan) => formatPlanResponse(plan));
    return { plans };
  });

  app.get(
    "/current",
    {
      preHandler: [verifyJWT, getCurrentUser],
    },
    async (request) => {
      const userId = request.user?.id;
      if (!userId) {
        throw new AuthError("Authentication required");
      }

      const subscription = await getSubscriptionByUserId(userId);
      return buildCurrentSubscriptionResponse(subscription);
    },
  );

  app.post(
    "/purchase",
    {
      preHandler: [verifyJWT, getCurrentUser, validateRequest({ body: purchaseSchema })],
    },
    async (request) => {
      const userId = request.user?.id;
      if (!userId) {
        throw new AuthError("Authentication required");
      }

      const { plan_type } = request.body as PurchaseBody;
      const plan = getPlanByType(plan_type);

      const orderId = randomUUID();
      const robokassaUrl = generatePaymentURL({
        orderId,
        amount: plan.price,
        description: `Подписка ${plan.name}`,
      });

      const paymentId = await persistPayment(orderId, plan, userId);

      return {
        payment_id: paymentId,
        robokassa_url: robokassaUrl,
        order_id: orderId,
      };
    },
  );

  app.post(
    "/webhook/robokassa",
    {
      preHandler: [validateRequest({ body: webhookSchema })],
    },
    async (request) => {
      const body = request.body as RobokassaWebhookBody;
      const merchantConfig = getMerchantConfig();

      if (body.MerchantLogin.trim() !== merchantConfig.merchantLogin) {
        throw new ForbiddenError("Invalid merchant login");
      }

      const sumValue = body.OutSum ?? body.Sum;
      if (sumValue === undefined) {
        throw new AppError("Missing payment amount", {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          code: "VALIDATION_ERROR",
        });
      }

      const normalizedAmount = formatRobokassaAmount(sumValue);
      const signatureValid = verifySignature({ orderId: body.InvId, sum: normalizedAmount, signature: body.SignatureValue });
      if (!signatureValid) {
        throw new AppError("Invalid signature", {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          code: "VALIDATION_ERROR",
        });
      }

      const client = await pgPool.connect();
      let affectedUserId: string | null = null;

      try {
        await client.query("BEGIN");

        const paymentResult = await client.query<PaymentRow>(
          `SELECT id, user_id, status, payload, subscription_id
           FROM payments
           WHERE transaction_id = $1
           LIMIT 1
           FOR UPDATE`,
          [body.InvId],
        );

        if (paymentResult.rowCount === 0) {
          throw new NotFoundError("Payment not found", { orderId: body.InvId });
        }

        const payment = paymentResult.rows[0];
        affectedUserId = payment.user_id;

        if (payment.status === "completed") {
          await client.query("COMMIT");
          return { result: "OK" };
        }

        const paymentPayload = parseJsonObject(payment.payload);
        const planType = extractPlanType(paymentPayload);
        const plan = getPlanByType(planType);

        const existingSubscription = await getSubscriptionByUserId(payment.user_id, client);
        const { startsAt, expiresAt } = calculatePlanExpiration(existingSubscription, plan);

        const metadataPatch = {
          ...(existingSubscription?.metadata ?? {}),
          ...(paymentPayload ?? {}),
          plan_type: plan.type,
          plan_name: plan.name,
          source: paymentPayload?.source ?? "robokassa",
          renewal: "manual",
          autoRenew: false,
          last_payment_id: payment.id,
        } satisfies Record<string, unknown>;

        const subscription = existingSubscription
          ? await updateSubscription(existingSubscription.id, {
              planCode: plan.type,
              planName: plan.name,
              status: "active",
              startedAt,
              expiresAt,
              metadata: metadataPatch,
            }, client)
          : await createSubscription(
              {
                userId: payment.user_id,
                planCode: plan.type,
                planName: plan.name,
                status: "active",
                startedAt,
                expiresAt,
                metadata: metadataPatch,
              },
              client,
            );

        await applyUsageLimitsForPlan(payment.user_id, plan, expiresAt, client);

        await client.query(
          `UPDATE payments
           SET status = 'completed',
               paid_at = NOW(),
               subscription_id = $2,
               payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb
           WHERE id = $1`,
          [payment.id, subscription.id, JSON.stringify({ webhook: { InvId: body.InvId, Sum: normalizedAmount } })],
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      if (affectedUserId) {
        await invalidateDashboardCache(affectedUserId);
      }

      return { result: "OK" };
    },
  );
}
