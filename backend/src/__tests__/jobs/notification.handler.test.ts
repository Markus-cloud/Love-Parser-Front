import { describe, expect, it, vi } from "vitest";
import type { Job } from "bull";

import { handleNotificationJob } from "@/queue/jobHandlers/notification.handler";

describe("notification job handler", () => {
  it("returns delivery payload", async () => {
    const job = buildJob();
    const payload = await handleNotificationJob(job as Job<any>);

    expect(payload.notificationId).toBe("notif-1");
    expect(job.progress).toHaveBeenCalledWith(100);
  });
});

function buildJob() {
  return {
    id: "job-1",
    data: { notificationId: "notif-1", userId: "user-1", channel: "telegram", template: "welcome" },
    progress: vi.fn().mockResolvedValue(undefined),
  };
}
