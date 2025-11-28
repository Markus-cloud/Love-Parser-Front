import { AudienceSegment } from "@/types/audience";

export const defaultAudienceSegment: AudienceSegment = {
  id: "segment-1",
  userId: "user-123",
  name: "Crypto Enthusiasts",
  description: "Users into crypto",
  sourceParsingId: "search-1",
  filters: {
    language: "en",
    engagementMin: 0.4,
    minSubscribers: 1000,
  },
  totalRecipients: 1250,
  status: "ready",
  createdAt: new Date("2025-01-01T10:00:00Z").toISOString(),
  updatedAt: new Date("2025-01-01T11:00:00Z").toISOString(),
};
