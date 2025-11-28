import { describe, expect, it, vi } from "vitest";
import type { Job } from "bull";

import { handleCleanupJob } from "@/queue/jobHandlers/cleanup.handler";

describe("cleanup job handler", () => {
  it("returns removed count based on batch size", async () => {
    const job = buildJob({ batchSize: 50, dryRun: false });
    const result = await handleCleanupJob(job as Job<any>);
    expect(result.removed).toBe(50);
    expect(result.dryRun).toBe(false);
    expect(job.progress).toHaveBeenCalledWith(100);
  });
});

function buildJob(data: { batchSize: number; dryRun: boolean }) {
  return {
    id: "job-1",
    data,
    progress: vi.fn().mockResolvedValue(undefined),
  };
}
