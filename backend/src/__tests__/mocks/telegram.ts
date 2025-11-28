import { Api } from "telegram";

export function buildTelegramUser(overrides?: Partial<Api.User>): Api.User {
  return {
    id: BigInt(123456789),
    accessHash: BigInt(0),
    firstName: "Alice",
    lastName: "Smith",
    username: "alice",
    phone: "+1234567890",
    langCode: "en",
    ...overrides,
  } as Api.User;
}
