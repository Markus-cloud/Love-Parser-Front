import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createCampaign,
  getCampaignLogs,
  getCampaignProgress,
  startCampaign,
} from "@/services/broadcast/broadcastService";

const {
  queryMock,
  mockAssertCampaignQuota,
  mockAssertMessageQuota,
  mockIncrementCampaignUsage,
  mockIncrementMessageUsage,
  mockAddJob,
  mockSaveBroadcastProgress,
  mockReadBroadcastProgress,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  mockAssertCampaignQuota: vi.fn(),
  mockAssertMessageQuota: vi.fn(),
  mockIncrementCampaignUsage: vi.fn(),
  mockIncrementMessageUsage: vi.fn(),
  mockAddJob: vi.fn(),
  mockSaveBroadcastProgress: vi.fn(),
  mockReadBroadcastProgress: vi.fn(),
}));

vi.mock("@/utils/clients", () => ({
  pgPool: {
    query: queryMock,
  },
}));

vi.mock("@/services/broadcast/usage.service", () => ({
  assertBroadcastCampaignQuotaAvailable: mockAssertCampaignQuota,
  assertBroadcastMessageQuotaAvailable: mockAssertMessageQuota,
  incrementBroadcastCampaignUsage: mockIncrementCampaignUsage,
  incrementBroadcastMessageUsage: mockIncrementMessageUsage,
}));

vi.mock("@/utils/queueHelpers", () => ({
  addJob: mockAddJob,
}));

vi.mock("@/services/broadcast/progress.service", () => ({
  saveBroadcastProgress: mockSaveBroadcastProgress,
  readBroadcastProgress: mockReadBroadcastProgress,
}));

describe("Broadcast service", () => {
  const now = new Date("2025-01-01T10:00:00Z");
  const baseRow = buildCampaignRow({ created_at: now, updated_at: now });

  beforeEach(() => {
    queryMock.mockReset();
    mockAssertCampaignQuota.mockReset();
    mockAssertMessageQuota.mockReset();
    mockIncrementCampaignUsage.mockReset();
    mockIncrementMessageUsage.mockReset();
    mockAddJob.mockReset();
    mockSaveBroadcastProgress.mockReset();
    mockReadBroadcastProgress.mockReset();

    mockAddJob.mockResolvedValue({ id: "job-1" });
    mockReadBroadcastProgress.mockResolvedValue({
      campaignId: baseRow.id,
      status: "completed",
      sent: 10,
      failed: 0,
      blocked: 0,
      total: 10,
      progress: 100,
      eta_seconds: 0,
      last_error: null,
      updated_at: now.toISOString(),
    });

    queryMock.mockImplementation(async (sql, params) => {
      const normalized = normalizeSql(sql);

      if (normalized.startsWith("insert into broadcast_campaigns")) {
        return { rowCount: 1, rows: [baseRow] };
      }

      if (normalized.startsWith("select * from broadcast_campaigns where id = $1 and user_id = $2")) {
        return { rowCount: 1, rows: [baseRow] };
      }

      if (normalized.startsWith("select * from broadcast_campaigns where id = $1 limit 1")) {
        return { rowCount: 1, rows: [baseRow] };
      }

      if (normalized.startsWith("update broadcast_campaigns set status = 'in_progress'")) {
        return { rowCount: 1, rows: [] };
      }

      if (normalized.startsWith("select id, campaign_id, user_id")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: "log-1",
              campaign_id: baseRow.id,
              user_id: baseRow.user_id,
              recipient_username: "@user",
              recipient_id: null,
              status: "delivered",
              error_code: null,
              error_message: null,
              sent_at: now,
            },
          ],
        };
      }

      return { rowCount: 0, rows: [] };
    });
  });

  it("creates manual broadcast campaigns", async () => {
    const result = await createCampaign({
      userId: baseRow.user_id,
      manualRecipients: ["@alpha", "@beta"],
      message: { text: "Hello" },
    });

    expect(result).toMatchObject({ campaignId: baseRow.id, totalRecipients: baseRow.total_recipients });
    expect(mockAssertCampaignQuota).toHaveBeenCalledWith(baseRow.user_id);
    expect(mockIncrementCampaignUsage).toHaveBeenCalledWith(baseRow.user_id, 1);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("insert into broadcast_campaigns"), expect.any(Array));
  });

  it("starts campaigns via queue jobs", async () => {
    const result = await startCampaign(baseRow.user_id, baseRow.id);
    expect(result).toMatchObject({ status: "in_progress", campaignId: baseRow.id });
    expect(mockAddJob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ campaignId: baseRow.id }));
    expect(mockSaveBroadcastProgress).toHaveBeenCalledWith(baseRow.id, expect.objectContaining({ status: "in_progress" }));
  });

  it("reads cached progress snapshots", async () => {
    const snapshot = await getCampaignProgress(baseRow.user_id, baseRow.id);
    expect(snapshot.status).toBe("completed");
    expect(mockReadBroadcastProgress).toHaveBeenCalledWith(baseRow.id);
  });

  it("fetches campaign logs", async () => {
    const payload = await getCampaignLogs(baseRow.user_id, baseRow.id, { page: 1, limit: 20 });
    expect(payload.logs).toHaveLength(1);
    expect(payload.logs[0]).toMatchObject({ recipientUsername: "@user", status: "delivered" });
  });
});

function buildCampaignRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "camp-1",
    user_id: "user-123",
    segment_id: null,
    target_type: "manual",
    manual_recipients: JSON.stringify(["@alpha", "@beta"]),
    message: JSON.stringify({ text: "Hello" }),
    delay_config: JSON.stringify({ min_ms: 1000, max_ms: 2000 }),
    total_recipients: 2,
    sent_count: 0,
    failed_count: 0,
    blocked_count: 0,
    status: "draft",
    job_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    started_at: null,
    completed_at: null,
    title: "Hello",
    content: "Hello",
    last_error: null,
    ...overrides,
  };
}

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
