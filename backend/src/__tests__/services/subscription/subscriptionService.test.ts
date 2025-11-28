import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  applyUsageLimitsForPlan,
  calculatePlanExpiration,
  getPlanByType,
} from "@/services/subscription/subscriptionService";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@/utils/clients", () => ({
  pgPool: {
    query: queryMock,
  },
}));

describe("subscriptionService", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns defensive copies of plan definitions", () => {
    const monthPlan = getPlanByType("month");
    monthPlan.limits.parsing = 999;

    const monthAgain = getPlanByType("month");
    expect(monthAgain.limits.parsing).not.toBe(999);
  });

  it("extends expiration when user already has an active subscription", () => {
    const plan = getPlanByType("week");
    const now = new Date();
    const existingExpires = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const result = calculatePlanExpiration(
      {
        id: "sub-1",
        userId: "user-1",
        planCode: "week",
        planName: "Week",
        status: "active",
        startedAt: now,
        expiresAt: existingExpires,
        metadata: null,
      },
      plan,
    );

    expect(result.expiresAt.getTime()).toBeGreaterThan(existingExpires.getTime());
  });

  it("upserts usage limits for every mapped key", async () => {
    queryMock.mockResolvedValue({});
    const plan = getPlanByType("month");
    const expiresAt = new Date("2025-02-01T00:00:00Z");

    await applyUsageLimitsForPlan("user-1", plan, expiresAt);

    expect(queryMock).toHaveBeenCalledTimes(8);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO usage_limits"),
      expect.arrayContaining(["user-1", expect.any(String), expect.any(Number), expiresAt]),
    );
  });
});
