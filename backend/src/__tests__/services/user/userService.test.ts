import { describe, expect, it, beforeEach, vi } from "vitest";

import { ValidationError } from "@/utils/errors";
import { createUser, updateTelegramProfile, updateUserProfile } from "@/services/user/userService";
import { defaultTestUser, buildUserRow } from "@/__tests__/fixtures/users";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

const { invalidateDashboardCacheMock } = vi.hoisted(() => ({
  invalidateDashboardCacheMock: vi.fn(),
}));

vi.mock("@/utils/clients", () => ({
  pgPool: {
    query: queryMock,
  },
}));

vi.mock("@/services/dashboard/dashboard.service", () => ({
  invalidateDashboardCache: invalidateDashboardCacheMock,
}));

describe("userService", () => {
  beforeEach(() => {
    queryMock.mockReset();
    invalidateDashboardCacheMock.mockReset();
  });

  it("creates users and invalidates dashboard cache", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [buildUserRow()],
      rowCount: 1,
    });

    const user = await createUser({
      phoneNumber: defaultTestUser.phoneNumber,
      telegramId: defaultTestUser.telegramId,
      telegramUsername: defaultTestUser.telegramUsername,
      fullName: defaultTestUser.fullName,
      profile: defaultTestUser.profile,
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(user).toMatchObject({
      id: defaultTestUser.id,
      telegramUsername: defaultTestUser.telegramUsername,
      profile: defaultTestUser.profile,
    });
    expect(invalidateDashboardCacheMock).toHaveBeenCalledWith(user.id);
  });

  it("throws validation error when update payload is empty", async () => {
    await expect(updateUserProfile(defaultTestUser.id, {})).rejects.toBeInstanceOf(ValidationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns existing user when telegram profile update is empty", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [buildUserRow()],
      rowCount: 1,
    });

    const user = await updateTelegramProfile(defaultTestUser.id, {});
    expect(user.id).toBe(defaultTestUser.id);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(invalidateDashboardCacheMock).not.toHaveBeenCalled();
  });
});
