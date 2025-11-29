import request from "supertest";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { buildAuthHeader, buildTestServer } from "@/__tests__/helpers/server";

vi.mock("@/middleware/rateLimitMiddleware", () => ({
  rateLimitMiddleware: vi.fn(),
}));

vi.mock("@/services/auth/tokenBlacklist.service", () => ({
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  blacklistToken: vi.fn().mockResolvedValue(undefined),
}));

let currentUserId = "user-123";

vi.mock("@/middleware/getCurrentUser", () => ({
  getCurrentUser: vi.fn(async (request) => {
    request.user = { id: currentUserId };
  }),
}));

const {
  mockGetAvailablePlans,
  mockGetPlanByType,
  mockGetSubscriptionByUserId,
  mockUpdateSubscription,
  mockCreateSubscription,
  mockApplyUsageLimitsForPlan,
  mockCalculatePlanExpiration,
  mockGeneratePaymentURL,
  mockGetMerchantConfig,
  mockVerifySignature,
  mockFormatRobokassaAmount,
  mockInvalidateDashboardCache,
  poolQueryMock,
  poolConnectMock,
  clientQueryMock,
  clientReleaseMock,
} = vi.hoisted(() => ({
  mockGetAvailablePlans: vi.fn(),
  mockGetPlanByType: vi.fn(),
  mockGetSubscriptionByUserId: vi.fn(),
  mockUpdateSubscription: vi.fn(),
  mockCreateSubscription: vi.fn(),
  mockApplyUsageLimitsForPlan: vi.fn(),
  mockCalculatePlanExpiration: vi.fn(),
  mockGeneratePaymentURL: vi.fn(),
  mockGetMerchantConfig: vi.fn(),
  mockVerifySignature: vi.fn(),
  mockFormatRobokassaAmount: vi.fn(),
  mockInvalidateDashboardCache: vi.fn(),
  poolQueryMock: vi.fn(),
  poolConnectMock: vi.fn(),
  clientQueryMock: vi.fn(),
  clientReleaseMock: vi.fn(),
}));

vi.mock("@/services/subscription/subscriptionService", () => ({
  getAvailablePlans: mockGetAvailablePlans,
  getPlanByType: mockGetPlanByType,
  getSubscriptionByUserId: mockGetSubscriptionByUserId,
  updateSubscription: mockUpdateSubscription,
  createSubscription: mockCreateSubscription,
  applyUsageLimitsForPlan: mockApplyUsageLimitsForPlan,
  calculatePlanExpiration: mockCalculatePlanExpiration,
  checkSubscriptionExpired: vi.fn(),
}));

vi.mock("@/integrations/robokassa", () => ({
  generatePaymentURL: mockGeneratePaymentURL,
  getMerchantConfig: mockGetMerchantConfig,
  verifySignature: mockVerifySignature,
  formatRobokassaAmount: mockFormatRobokassaAmount,
}));

vi.mock("@/services/dashboard/dashboard.service", () => ({
  invalidateDashboardCache: mockInvalidateDashboardCache,
}));

vi.mock("@/utils/clients", () => ({
  pgPool: {
    query: poolQueryMock,
    connect: poolConnectMock,
  },
}));

describe("Subscription routes", () => {
  beforeEach(() => {
    currentUserId = "user-123";
    poolQueryMock.mockReset();
    poolConnectMock.mockReset();
    clientQueryMock.mockReset();
    clientReleaseMock.mockReset();
    mockGetAvailablePlans.mockReturnValue([
      { type: "week", name: "Неделя", price: 450, currency: "RUB", durationDays: 7, limits: { parsing: 10, audience: 10, broadcast: 10 } },
    ]);
    mockGetPlanByType.mockReturnValue({
      type: "week",
      name: "Неделя",
      price: 450,
      currency: "RUB",
      durationDays: 7,
      limits: { parsing: 10, audience: 10, broadcast: 10 },
    });
    mockGeneratePaymentURL.mockReturnValue("https://pay.example.com");
    mockGetMerchantConfig.mockReturnValue({ merchantLogin: "demoMerchant", password1: "p1", password2: "p2", isTest: true, paymentUrl: "" });
    mockVerifySignature.mockReturnValue(true);
    mockFormatRobokassaAmount.mockImplementation((value) => (typeof value === "number" ? value.toFixed(2) : value));
    poolQueryMock.mockResolvedValue({ rows: [{ id: "payment-1" }], rowCount: 1 });
    poolConnectMock.mockResolvedValue({
      query: clientQueryMock,
      release: clientReleaseMock,
    });
    clientQueryMock.mockImplementation(async (sql, params) => {
      const normalized = normalizeSql(sql);
      if (normalized.startsWith("begin") || normalized.startsWith("commit")) {
        return { rowCount: 0, rows: [] };
      }

      if (normalized.startsWith("select id, user_id")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: "payment-1",
              user_id: currentUserId,
              status: "pending",
              payload: JSON.stringify({ plan_type: "week" }),
              subscription_id: null,
            },
          ],
        };
      }

      if (normalized.startsWith("update payments")) {
        return { rowCount: 1, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    });
    clientReleaseMock.mockReset();
    mockGetSubscriptionByUserId.mockResolvedValue(null);
    mockCreateSubscription.mockResolvedValue({ id: "sub-1", userId: currentUserId });
    mockCalculatePlanExpiration.mockReturnValue({
      startsAt: new Date("2025-01-01T00:00:00Z"),
      expiresAt: new Date("2025-02-01T00:00:00Z"),
    });
    mockApplyUsageLimitsForPlan.mockResolvedValue(undefined);
  });

  it("lists available plans", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server).get("/api/v1/subscriptions/plans");
      expect(response.status).toBe(200);
      expect(response.body.plans).toHaveLength(1);
      expect(mockGetAvailablePlans).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("creates purchase orders", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server)
        .post("/api/v1/subscriptions/purchase")
        .set("Authorization", buildAuthHeader(currentUserId))
        .send({ plan_type: "week" });

      expect(response.status).toBe(200);
      expect(response.body.payment_id).toBe("payment-1");
      expect(response.body.robokassa_url).toBe("https://pay.example.com");
      expect(poolQueryMock).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("processes Robokassa webhooks", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server)
        .post("/api/v1/subscriptions/webhook/robokassa")
        .send({
          MerchantLogin: "demoMerchant",
          SignatureValue: "signed",
          InvId: "payment-1",
          OutSum: "450.00",
        });

      expect(response.status).toBe(200);
      expect(mockCreateSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ userId: currentUserId, planCode: "week" }),
        expect.objectContaining({ query: expect.any(Function) }),
      );
      expect(mockApplyUsageLimitsForPlan).toHaveBeenCalled();
      expect(mockInvalidateDashboardCache).toHaveBeenCalledWith(currentUserId);
      expect(clientReleaseMock).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

function normalizeSql(sql: unknown) {
  if (typeof sql === "string") {
    return collapseWhitespace(sql);
  }

  if (typeof sql === "object" && sql && "text" in (sql as Record<string, unknown>)) {
    return collapseWhitespace(String((sql as { text?: string }).text ?? ""));
  }

  return "";
}

function collapseWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}
