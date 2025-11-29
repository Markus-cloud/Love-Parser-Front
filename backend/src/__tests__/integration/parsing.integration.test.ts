import request from "supertest";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { defaultParsedChannel, defaultParsingHistoryEntry } from "@/__tests__/fixtures/parsing";
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
  mockAssertParsingQuotaAvailable,
  mockIncrementParsingUsage,
  mockCreateParsingSearch,
  mockMergeParsingMetadata,
  mockGetParsingResults,
  mockGetAllParsedChannels,
  mockSaveParsingProgress,
  mockAddJob,
} = vi.hoisted(() => ({
  mockAssertActiveSubscription: vi.fn(),
  mockAssertParsingQuotaAvailable: vi.fn(),
  mockIncrementParsingUsage: vi.fn(),
  mockCreateParsingSearch: vi.fn(),
  mockMergeParsingMetadata: vi.fn(),
  mockGetParsingResults: vi.fn(),
  mockGetAllParsedChannels: vi.fn(),
  mockSaveParsingProgress: vi.fn(),
  mockAddJob: vi.fn(),
}));

vi.mock("@/services/parsing/usage.service", () => ({
  assertActiveSubscription: mockAssertActiveSubscription,
  assertParsingQuotaAvailable: mockAssertParsingQuotaAvailable,
  incrementParsingUsage: mockIncrementParsingUsage,
}));

vi.mock("@/services/parsing/parsing.service", () => ({
  createParsingSearch: mockCreateParsingSearch,
  mergeParsingMetadata: mockMergeParsingMetadata,
  getParsingResults: mockGetParsingResults,
  getAllParsedChannels: mockGetAllParsedChannels,
}));

vi.mock("@/services/parsing/progress.service", () => ({
  saveParsingProgress: mockSaveParsingProgress,
  readParsingProgress: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/queueHelpers", () => ({
  addJob: mockAddJob,
}));

describe("Parsing routes", () => {
  beforeEach(() => {
    currentUserId = "user-123";
    mockCreateParsingSearch.mockResolvedValue(defaultParsingHistoryEntry);
    mockAddJob.mockResolvedValue({ id: "job-1" });
    mockMergeParsingMetadata.mockResolvedValue(undefined);
    mockSaveParsingProgress.mockResolvedValue(undefined);
    mockGetParsingResults.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 50,
      results: [defaultParsedChannel],
    });
    mockGetAllParsedChannels.mockResolvedValue([defaultParsedChannel]);
  });

  it("creates parsing searches", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server)
        .post("/api/v1/parsing/search")
        .set("Authorization", buildAuthHeader(currentUserId))
        .send({ query: "Crypto", filters: { language: "EN" } });

      expect(response.status).toBe(202);
      expect(mockCreateParsingSearch).toHaveBeenCalledWith(
        currentUserId,
        "Crypto",
        { language: "en" },
        "simulation",
      );
      expect(mockSaveParsingProgress).toHaveBeenCalledWith(defaultParsingHistoryEntry.id, expect.any(Object));
      expect(mockAddJob).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("returns parsed results for completed searches", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server)
        .get(`/api/v1/parsing/${defaultParsingHistoryEntry.id}/results`)
        .set("Authorization", buildAuthHeader(currentUserId));

      expect(response.status).toBe(200);
      expect(response.body.results[0]).toMatchObject({
        channel_id: defaultParsedChannel.channelId,
        activity_level: defaultParsedChannel.activityLevel,
      });
      expect(mockGetParsingResults).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("streams CSV exports", async () => {
    const app = await buildTestServer();
    try {
      const response = await request(app.server)
        .get(`/api/v1/parsing/${defaultParsingHistoryEntry.id}/export`)
        .set("Authorization", buildAuthHeader(currentUserId));

      expect(response.status).toBe(200);
      expect(response.header["content-type"]).toContain("text/csv");
      expect(response.text).toContain(defaultParsedChannel.title);
      expect(mockGetAllParsedChannels).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
