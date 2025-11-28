import { describe, expect, it, vi } from "vitest";
import type { Job } from "bull";

import { handleBroadcastJob } from "@/queue/jobHandlers/broadcast.handler";

const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();

vi.mock("@/monitoring/prometheus", () => ({
  recordBroadcastSuccess: mockRecordSuccess,
  recordBroadcastFailure: mockRecordFailure,
}));

describe("broadcast job handler", () => {
  it("processes all recipients", async () => {
    const job = buildJob({ audience: ["@alpha", "@beta"] });
    const result = await handleBroadcastJob(job as Job<any>);

    expect(result.deliveredCount).toBe(2);
    expect(mockRecordSuccess).toHaveBeenCalledWith(2);
    expect(job.progress).toHaveBeenCalledWith(100);
  });

  it("records failures when execution throws", async () => {
    const job = buildJob({ audience: ["@alpha"] });
    job.progress = vi.fn().mockRejectedValueOnce(new Error("boom"));

    await expect(handleBroadcastJob(job as Job<any>)).rejects.toThrow("boom");
    expect(mockRecordFailure).toHaveBeenCalled();
  });
});

function buildJob(overrides?: Partial<{ audience: string[] }>) {
  const data = {
    broadcastId: "bc-1",
    audience: overrides?.audience ?? ["@alpha"],
    priority: "high",
  };

  return {
    id: "job-1",
    data,
    progress: vi.fn().mockResolvedValue(undefined),
  };
}
