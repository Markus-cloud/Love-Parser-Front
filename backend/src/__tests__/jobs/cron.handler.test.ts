import { describe, expect, it, vi } from "vitest";
import type { Job } from "bull";

import { handleCronJob } from "@/queue/jobHandlers/cron.handler";

const mockGetCronJobByKey = vi.fn();
const mockStartTimer = vi.fn();
const mockStopTimer = vi.fn();
const mockCounterInc = vi.fn();

vi.mock("@/jobs/cron", () => ({
  getCronJobByKey: mockGetCronJobByKey,
}));

vi.mock("@/monitoring/prometheus", () => ({
  cronJobDurationHistogram: {
    startTimer: mockStartTimer,
  },
  cronJobResultCounter: {
    labels: () => ({ inc: mockCounterInc }),
  },
}));

mockStartTimer.mockReturnValue(mockStopTimer);

describe("cron job handler", () => {
  beforeEach(() => {
    mockCounterInc.mockReset();
    mockGetCronJobByKey.mockReset();
    mockStartTimer.mockClear();
    mockStopTimer.mockClear();
  });

  it("runs registered cron jobs", async () => {
    const cronHandler = vi.fn().mockResolvedValue(undefined);
    mockGetCronJobByKey.mockReturnValue({ key: "cleanup", schedule: "* * * * *", handler: cronHandler });

    await handleCronJob(buildJob({ jobKey: "cleanup" }) as Job<any>);
    expect(cronHandler).toHaveBeenCalled();
    expect(mockCounterInc).toHaveBeenCalled();
    expect(mockStopTimer).toHaveBeenCalled();
  });

  it("ignores unknown cron keys", async () => {
    mockGetCronJobByKey.mockReturnValue(undefined);
    await handleCronJob(buildJob({ jobKey: "missing" }) as Job<any>);
    expect(mockCounterInc).not.toHaveBeenCalled();
  });
});

function buildJob(data: { jobKey?: string }) {
  return {
    id: "job-1",
    data,
    progress: vi.fn().mockResolvedValue(undefined),
  };
}
