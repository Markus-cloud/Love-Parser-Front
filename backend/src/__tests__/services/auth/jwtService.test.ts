import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { jwtService } from "@/services/auth/jwtService";

const TEST_PAYLOAD = {
  userId: "user-123",
  sessionId: "session-456",
  telegramId: "7890",
  claims: { scope: ["parsing:read"] },
};

describe("jwtService", () => {
  it("generates access tokens with expected TTL", () => {
    const token = jwtService.generateAccessToken(TEST_PAYLOAD);
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    expect(decoded.sub).toBe(TEST_PAYLOAD.userId);
    expect(decoded.sessionId).toBe(TEST_PAYLOAD.sessionId);
    expect(decoded.telegramId).toBe(TEST_PAYLOAD.telegramId);
    expect(decoded.scope).toEqual(TEST_PAYLOAD.claims?.scope);
    expect(decoded.exp && decoded.iat).toBeTruthy();
    expect((decoded.exp ?? 0) - (decoded.iat ?? 0)).toBe(jwtService.ACCESS_TOKEN_TTL_SECONDS);
  });

  it("generates refresh tokens with a longer TTL", () => {
    const token = jwtService.generateRefreshToken(TEST_PAYLOAD);
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    expect((decoded.exp ?? 0) - (decoded.iat ?? 0)).toBe(jwtService.REFRESH_TOKEN_TTL_SECONDS);
  });

  it("verifies access tokens", () => {
    const token = jwtService.generateAccessToken(TEST_PAYLOAD);
    const payload = jwtService.verifyAccessToken(token);
    expect(payload.sub).toBe(TEST_PAYLOAD.userId);
    expect(payload.sessionId).toBe(TEST_PAYLOAD.sessionId);
  });
});
