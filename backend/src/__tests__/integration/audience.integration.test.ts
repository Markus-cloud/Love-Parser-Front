import request from "supertest";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { defaultAudienceSegment } from "@/__tests__/fixtures/audience";
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
  mockAssertActiveSubscription,
  mockAddJob,
  mockCreateSegment,
  mockGetSegment,
  mockUpdateSegment,
} = vi.hoisted(() => ({
  mockAssertActiveSubscription: vi.fn(),
  mockAddJob: vi.fn(),
  mockCreateSegment: vi.fn(),
  mockGetSegment: vi.fn(),
  mockUpdateSegment: vi.fn(),
}));

vi.mock("@/services/parsing/usage.service", () => ({
  assertActiveSubscription: mockAssertActiveSubscription,
}));

vi.mock("@/utils/queueHelpers", () => ({
  addJob: mockAddJob,
}));

vi.mock("@/services/audience/audienceService", () => ({
  createSegment: mockCreateSegment,
  getSegment: mockGetSegment,
  updateSegment: mockUpdateSegment,
  listSegments: vi.fn(),
  deleteSegment: vi.fn(),
  getSegmentPreview: vi.fn(),
}));

describe("Audience routes", () => {
  beforeEach(() => {
    currentUserId = "user-123";
    mockCreateSegment.mockResolvedValue(defaultAudienceSegment);
    mockGetSegment.mockResolvedValue(defaultAudienceSegment);
    mockUpdateSegment.mockResolvedValue({ ...defaultAudienceSegment, totalRecipients: 1500 });
    mockAddJob.mockResolvedValue({ id: "job-5" });
  });

  it("creates audience segments and enqueues refresh", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server)
        .post("/api/v1/audience/segments")
        .set("Authorization", buildAuthHeader(currentUserId))
        .send({
          name: "Crypto Fans",
          description: "Daily alpha",
          source_parsing_id: defaultAudienceSegment.sourceParsingId,
          filters: { language: "EN", engagement_min: 0.5 },
        });

      expect(response.status).toBe(201);
      expect(mockCreateSegment).toHaveBeenCalledWith({
        userId: currentUserId,
        name: "Crypto Fans",
        description: "Daily alpha",
        sourceParsingId: defaultAudienceSegment.sourceParsingId,
        filters: { language: "en", engagementMin: 0.5 },
      });
      expect(mockAddJob).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("returns segment details", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server)
        .get(`/api/v1/audience/${defaultAudienceSegment.id}`)
        .set("Authorization", buildAuthHeader(currentUserId));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: defaultAudienceSegment.id, filters: { language: "en" } });
    } finally {
      await app.close();
    }
  });

  it("updates audience filters", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server)
        .put(`/api/v1/audience/${defaultAudienceSegment.id}`)
        .set("Authorization", buildAuthHeader(currentUserId))
        .send({ filters: { engagement_min: 0.7 } });

      expect(response.status).toBe(200);
      expect(mockUpdateSegment).toHaveBeenCalledWith({
        userId: currentUserId,
        segmentId: defaultAudienceSegment.id,
        filters: { engagementMin: 0.7 },
      });
      expect(mockAddJob).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
