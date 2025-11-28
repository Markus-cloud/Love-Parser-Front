import apiClient from "./client";

import type { AudiencePreviewResponse, AudienceSegmentFilters, AudienceSegmentSummary } from "@/types/audience";
import type { AudiencePostFrequency } from "@/types/audience";

export interface CreateAudienceSegmentPayload {
  name: string;
  description?: string;
  sourceParsingId: string;
  filters?: {
    engagementMin?: number;
    engagementMax?: number;
    language?: string;
    minSubscribers?: number;
    postFrequency?: AudiencePostFrequency;
  };
}

export interface AudienceSegmentsQuery {
  page?: number;
  limit?: number;
}

function serializeFilters(filters?: CreateAudienceSegmentPayload["filters"]): AudienceSegmentFilters | undefined {
  if (!filters) {
    return undefined;
  }

  const payload: AudienceSegmentFilters = {};

  if (typeof filters.engagementMin === "number") {
    payload.engagement_min = Number(filters.engagementMin.toFixed(2));
  }

  if (typeof filters.engagementMax === "number") {
    payload.engagement_max = Number(filters.engagementMax.toFixed(2));
  }

  if (typeof filters.minSubscribers === "number") {
    payload.min_subscribers = filters.minSubscribers;
  }

  if (filters.language) {
    payload.language = filters.language.trim().toLowerCase();
  }

  if (filters.postFrequency) {
    payload.post_frequency = filters.postFrequency;
  }

  return Object.keys(payload).length ? payload : undefined;
}

export async function createAudienceSegment(payload: CreateAudienceSegmentPayload) {
  return apiClient.post<AudienceSegmentSummary>("/api/v1/audience/segments", {
    name: payload.name.trim(),
    description: payload.description?.trim() || undefined,
    source_parsing_id: payload.sourceParsingId,
    filters: serializeFilters(payload.filters),
  });
}

export async function getAudienceSegments(params?: AudienceSegmentsQuery) {
  return apiClient.get<AudienceSegmentSummary[]>("/api/v1/audience/segments", {
    params: {
      page: params?.page,
      limit: params?.limit,
    },
  });
}

export async function getAudienceSegmentPreview(segmentId: string, limit = 10) {
  return apiClient.get<AudiencePreviewResponse>(`/api/v1/audience/${segmentId}/preview`, {
    params: { limit },
  });
}
