import { User } from "@/types/user";

export const defaultTestUser: User = {
  id: "user-123",
  phoneNumber: "+79001234567",
  telegramId: "777000",
  telegramUsername: "testuser",
  fullName: "Test User",
  status: "active",
  profile: {
    telegram: {
      username: "testuser",
      firstName: "Test",
      lastName: "User",
    },
  },
};

export function buildUserRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "user-123",
    email: null,
    phone_number: "+79001234567",
    telegram_id: "777000",
    telegram_username: "testuser",
    full_name: "Test User",
    status: "active",
    profile: JSON.stringify(defaultTestUser.profile),
    ...overrides,
  };
}
