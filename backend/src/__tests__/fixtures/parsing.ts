import { ParsedChannel, ParsingHistoryEntry } from "@/types/parsing";

export const defaultParsingHistoryEntry: ParsingHistoryEntry = {
  id: "search-1",
  query: "crypto",
  status: "pending",
  resultCount: 0,
  createdAt: new Date("2025-01-15T10:00:00Z").toISOString(),
  filters: { language: "en" },
};

export const defaultParsedChannel: ParsedChannel = {
  channelId: "1001",
  title: "Crypto Alpha",
  username: "@crypto_alpha",
  subscribers: 42000,
  description: "Daily alpha",
  language: "en",
  activityScore: 0.82,
  activityLevel: "high",
  lastPost: new Date("2025-01-15T09:00:00Z").toISOString(),
};
