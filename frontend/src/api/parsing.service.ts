import apiClient, { API_BASE_URL } from "./client";

import type {
  ParsingFilters,
  ParsingHistoryItem,
  ParsingProgressSnapshot,
  ParsingResultsResponse,
  ParsingSearchResponse,
} from "@/types/parsing";
import type { ActivityLevel } from "@/types/parsing";

export interface CreateParsingSearchPayload {
  query: string;
  filters?: {
    language?: string;
    minSubscribers?: number;
    maxSubscribers?: number;
    activityLevel?: ActivityLevel;
  };
}

export interface ParsingHistoryQuery {
  page?: number;
  limit?: number;
}

export interface ParsingResultsQuery {
  page?: number;
  limit?: number;
  sortBy?: "subscribers" | "activity";
}

function serializeFilters(filters?: CreateParsingSearchPayload["filters"]): ParsingFilters | undefined {
  if (!filters) {
    return undefined;
  }

  const payload: ParsingFilters = {};

  if (filters.language) {
    payload.language = filters.language.trim().toLowerCase();
  }

  if (typeof filters.minSubscribers === "number") {
    payload.min_subscribers = filters.minSubscribers;
  }

  if (typeof filters.maxSubscribers === "number") {
    payload.max_subscribers = filters.maxSubscribers;
  }

  if (filters.activityLevel) {
    payload.activity_level = filters.activityLevel;
  }

  return Object.keys(payload).length ? payload : undefined;
}

export async function createParsingSearch(payload: CreateParsingSearchPayload) {
  return apiClient.post<ParsingSearchResponse>("/api/v1/parsing/search", {
    query: payload.query.trim(),
    filters: serializeFilters(payload.filters),
  });
}

export async function getParsingHistory(params?: ParsingHistoryQuery) {
  return apiClient.get<ParsingHistoryItem[]>("/api/v1/parsing/history", {
    params: {
      page: params?.page,
      limit: params?.limit,
    },
  });
}

export async function getParsingResults(searchId: string, params?: ParsingResultsQuery) {
  return apiClient.get<ParsingResultsResponse>(`/api/v1/parsing/${searchId}/results`, {
    params: {
      page: params?.page,
      limit: params?.limit,
      sort_by: params?.sortBy ?? "subscribers",
    },
  });
}

export async function exportParsingResults(searchId: string) {
  return apiClient.get<Blob>(`/api/v1/parsing/${searchId}/export`, {
    responseType: "blob",
    params: { format: "csv" },
  });
}

export function getParsingProgressUrl(searchId: string) {
  return `${API_BASE_URL}/api/v1/parsing/${searchId}/progress`;
}

export type { ParsingProgressSnapshot };
