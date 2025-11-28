import request from "supertest";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildTestServer, buildAuthHeader } from "@/__tests__/helpers/server";
import { createInMemoryRedisClient } from "@/__tests__/helpers/redisStore";
import { defaultTestUser } from "@/__tests__/fixtures/users";
import { buildTelegramUser } from "@/__tests__/mocks/telegram";

const redis = createInMemoryRedisClient();
const redisClient = redis.client;

vi.mock("@/middleware/rateLimitMiddleware", () => ({
  rateLimitMiddleware: vi.fn(),
}));

const tokenMock = {
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  blacklistToken: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/services/auth/tokenBlacklist.service", () => tokenMock);

let currentUserId = defaultTestUser.id;

vi.mock("@/middleware/getCurrentUser", () => ({
  getCurrentUser: vi.fn(async (request) => {
    request.user = { id: currentUserId };
  }),
}));

const mockBuildAuthUserResponse = vi.fn((user: { id: string }) => ({ id: user.id }));
const mockEnrichUserWithSubscription = vi.fn(async (payload) => ({
  ...payload,
  subscription: { plan: "free" },
}));
const mockEnrichUserWithLimits = vi.fn(async (payload) => ({
  ...payload,
  limits: { parsing: { limit: 10, used: 0 } },
}));

vi.mock("@/services/auth/currentUser.service", () => ({
  buildAuthUserResponse: mockBuildAuthUserResponse,
  enrichUserWithSubscription: mockEnrichUserWithSubscription,
  enrichUserWithLimits: mockEnrichUserWithLimits,
}));

const mockEnsureFreeSubscription = vi.fn();
const mockEnsureDefaultUsageLimits = vi.fn();
const mockCreateUser = vi.fn();
const mockGetUserByTelegramId = vi.fn();
const mockUpdateTelegramProfile = vi.fn();

vi.mock("@/services/user/userService", () => ({
  ensureFreeSubscription: mockEnsureFreeSubscription,
  ensureDefaultUsageLimits: mockEnsureDefaultUsageLimits,
  createUser: mockCreateUser,
  getUserByTelegramId: mockGetUserByTelegramId,
  updateTelegramProfile: mockUpdateTelegramProfile,
}));

const mockSendCode = vi.fn();
const mockVerifyCode = vi.fn();
const mockPersistSession = vi.fn();

vi.mock("@/services/telegram/sessionManager", () => ({
  TelegramSessionManager: vi.fn().mockImplementation(() => ({
    sendCode: mockSendCode,
    verifyCode: mockVerifyCode,
    persistSession: mockPersistSession,
  })),
}));

vi.mock("@/services/redis.service", () => ({
  withRedisClient: async (executor: (client: typeof redisClient) => Promise<unknown>) => executor(redisClient),
}));

describe("Auth integration", () => {
  beforeEach(() => {
    redisClient.clear();
    currentUserId = defaultTestUser.id;
    mockSendCode.mockReset();
    mockVerifyCode.mockReset();
    mockPersistSession.mockReset();
    mockEnsureFreeSubscription.mockReset();
    mockEnsureDefaultUsageLimits.mockReset();
    mockCreateUser.mockReset();
    mockGetUserByTelegramId.mockReset();
    mockUpdateTelegramProfile.mockReset();
  });

  it("sends Telegram auth codes and enforces rate limits", async () => {
    mockSendCode.mockResolvedValue({ phoneCodeHash: "hash-123", sessionString: "session-data" });

    const app = await buildTestServer();
    await expectSendCode(app, 200);

    const response = await request(app.server)
      .post("/api/v1/telegram/auth/send-code")
      .send({ phone_number: "+79001234567" });

    expect(response.status).toBe(429);
    await app.close();
  });

  it("verifies Telegram codes and issues access tokens", async () => {
    mockSendCode.mockResolvedValue({ phoneCodeHash: "hash-xyz", sessionString: "session" });
    mockVerifyCode.mockResolvedValue({
      sessionString: "persisted",
      telegramUser: buildTelegramUser({ id: BigInt(999) }),
    });
    mockGetUserByTelegramId.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue(defaultTestUser);

    const app = await buildTestServer();
    const sendCodeResponse = await expectSendCode(app, 200);

    const verifyResponse = await request(app.server)
      .post("/api/v1/telegram/auth/verify-code")
      .send({ auth_session_id: sendCodeResponse.body.auth_session_id, code: "123456" });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.access_token).toEqual(expect.any(String));
    expect(verifyResponse.body.user.id).toBe(defaultTestUser.id);
    expect(mockEnsureFreeSubscription).toHaveBeenCalledWith(defaultTestUser.id);
    expect(mockEnsureDefaultUsageLimits).toHaveBeenCalledWith(defaultTestUser.id);
    expect(mockPersistSession).toHaveBeenCalled();

    await app.close();
  });

  it("returns enriched user profile for /auth/me", async () => {
    const app = await buildTestServer();
    const response = await request(app.server)
      .get("/api/v1/auth/me")
      .set("Authorization", buildAuthHeader(defaultTestUser.id));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: defaultTestUser.id,
      subscription: { plan: "free" },
      limits: { parsing: { limit: 10, used: 0 } },
    });

    await app.close();
  });
});

async function expectSendCode(app: FastifyInstance, status: number) {
  const response = await request(app.server)
    .post("/api/v1/telegram/auth/send-code")
    .send({ phone_number: "+79001234567" });

  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ phone_code_hash: expect.any(String), auth_session_id: expect.any(String) });
  return response;
}
