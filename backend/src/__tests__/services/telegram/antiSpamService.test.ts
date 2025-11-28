import { describe, expect, it, beforeEach, vi } from "vitest";

import { calculateAdaptiveDelay, handleFloodWait, randomizeDelay } from "@/services/telegram/antiSpamService";

const originalRandom = Math.random;

describe("antiSpamService", () => {
  beforeEach(() => {
    global.Math.random = originalRandom;
  });

  it("increases delay for young accounts with failures", () => {
    const baseline = calculateAdaptiveDelay(0.01, 200);
    const risky = calculateAdaptiveDelay(0.3, 10);
    expect(risky).toBeGreaterThan(baseline);
  });

  it("randomizes delay with jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const delay = randomizeDelay(1000);
    expect(delay).toBeGreaterThan(800);
    expect(delay).toBeLessThan(1200);
  });

  it("returns min delay for invalid input", () => {
    expect(randomizeDelay(-10)).toBeGreaterThan(0);
  });

  it("parses FLOOD_WAIT errors", () => {
    expect(handleFloodWait(new Error("FLOOD_WAIT_15"))).toBe(15);
    expect(handleFloodWait("something else")).toBeNull();
  });
});
