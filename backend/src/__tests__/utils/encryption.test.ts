import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY = "0123456789abcdef0123456789abcdef";

describe("sessionEncryption", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_ENCRYPTION_KEY = TEST_KEY;
  });

  it("round-trips session payloads", async () => {
    const module = await import("@/services/telegram/sessionEncryption");
    const encrypted = module.encryptSession("secret session");
    expect(module.decryptSession(encrypted)).toBe("secret session");
  });

  it("rejects malformed buffers", async () => {
    const module = await import("@/services/telegram/sessionEncryption");
    await expect(() => module.decryptSession(Buffer.from("00ff", "hex"))).toThrowError();
  });
});
