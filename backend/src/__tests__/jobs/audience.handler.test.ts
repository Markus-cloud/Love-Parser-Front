import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Job } from "bull";

import { handleAudienceJob } from "@/queue/jobHandlers/audience.handler";

const mockGetSegment = vi.fn();
const mockCalculateTotalRecipients = vi.fn();
const mockInvalidateSegmentCache = vi.fn();
const mockInvalidateDashboardCache = vi.fn();
const queryMock = vi.fn();

vi.mock("@/services/audience/audienceService", () => ({
  getSegment: mockGetSegment,
  calculateTotalRecipients: mockCalculateTotalRecipients,
  invalidateSegmentCache: mockInvalidateSegmentCache,
}));

vi.mock("@/services/dashboard/dashboard.service", () => ({
  invalidateDashboardCache: mockInvalidateDashboardCache,
}));

vi.mock("@/utils/clients", () => ({
  pgPool: {
    query: queryMock,
  },
}));

describe("audience job handler", () => {
  beforeEach(() => {
    mockGetSegment.mockReset();
    mockCalculateTotalRecipients.mockReset();
    mockInvalidateSegmentCache.mockReset();
    mockInvalidateDashboardCache.mockReset();
    queryMock.mockReset();
  });

  it("persists total recipients when segment is valid", async () => {
    mockGetSegment.mockResolvedValue({ id: "segment-1", userId: "user-1", sourceParsingId: "search-1", filters: {} });
    mockCalculateTotalRecipients.mockResolvedValue(42);

    const job = buildJob({ segmentId: "segment-1", userId: "user-1" });
    const result = await handleAudienceJob(job as Job<any>);

    expect(result).toMatchObject({ totalRecipients: 42 });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("update audience_segments"), ["segment-1", "user-1", 42, "ready"]);
    expect(mockInvalidateDashboardCache).toHaveBeenCalledWith("user-1");
    expect(mockInvalidateSegmentCache).toHaveBeenCalledWith("user-1", "segment-1");
  });

  it("marks segment as failed when parsing source is missing", async () => {
    mockGetSegment.mockResolvedValue({ id: "segment-1", userId: "user-1", sourceParsingId: null, filters: {} });

    const job = buildJob({ segmentId: "segment-1", userId: "user-1" });
    const result = await handleAudienceJob(job as Job<any>);

    expect(result.totalRecipients).toBe(0);
    expect(mockCalculateTotalRecipients).not.toHaveBeenCalled();
    expect(mockInvalidateSegmentCache).toHaveBeenCalledWith("user-1", "segment-1");
  });
});

function buildJob(data: { segmentId: string; userId: string }) {
  return {
    id: "job-1",
    data,
    progress: vi.fn().mockResolvedValue(undefined),
  };
}
