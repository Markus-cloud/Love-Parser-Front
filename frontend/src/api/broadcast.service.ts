import apiClient, { API_BASE_URL } from "./client";

import type {
  BroadcastDelayConfig,
  BroadcastHistoryEntry,
  BroadcastLogEntry,
  BroadcastLogStatus,
  BroadcastMessage,
  BroadcastProgressSnapshot,
  BroadcastStatus,
} from "@/types/broadcast";

export interface CreateBroadcastCampaignPayload {
  segmentId?: string;
  manualRecipients?: string[];
  message: BroadcastMessage;
  delay?: Partial<BroadcastDelayConfig>;
}

export interface BroadcastHistoryQuery {
  page?: number;
  limit?: number;
  status?: BroadcastStatus;
}

export interface BroadcastLogsQuery {
  page?: number;
  limit?: number;
  status?: BroadcastLogStatus;
}

interface CampaignCreationResponse {
  campaign_id: string;
  total_recipients: number;
  status: BroadcastStatus;
}

interface StartCampaignResponse {
  campaign_id: string;
  status: BroadcastStatus;
  sent: number;
  total: number;
}

interface RetryCampaignResponse {
  campaign_id: string;
  status: BroadcastStatus;
  new_total: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export async function createBroadcastCampaign(payload: CreateBroadcastCampaignPayload) {
  return apiClient.post<CampaignCreationResponse>("/api/v1/broadcast/campaigns", {
    segment_id: payload.segmentId,
    manual_recipients: payload.manualRecipients,
    message: payload.message,
    delay: payload.delay,
  });
}

export async function startBroadcastCampaign(campaignId: string) {
  return apiClient.post<StartCampaignResponse>(`/api/v1/broadcast/campaigns/${campaignId}/start`);
}

export async function retryBroadcastCampaign(campaignId: string, options?: { retryOnlyFailed?: boolean }) {
  return apiClient.post<RetryCampaignResponse>(`/api/v1/broadcast/campaigns/${campaignId}/retry`, {
    retry_failed_only: options?.retryOnlyFailed ?? true,
  });
}

export async function getBroadcastHistory(params?: BroadcastHistoryQuery) {
  return apiClient.get<PaginatedResponse<BroadcastHistoryEntry>>("/api/v1/broadcast/history", {
    params: {
      page: params?.page,
      limit: params?.limit,
      status: params?.status,
    },
  });
}

export async function getBroadcastLogs(campaignId: string, params?: BroadcastLogsQuery) {
  return apiClient.get<PaginatedResponse<BroadcastLogEntry>>(`/api/v1/broadcast/campaigns/${campaignId}/logs`, {
    params: {
      page: params?.page,
      limit: params?.limit,
      status: params?.status,
    },
  });
}

export function getBroadcastProgressUrl(campaignId: string) {
  return `${API_BASE_URL}/api/v1/broadcast/campaigns/${campaignId}/progress`;
}

export type { BroadcastProgressSnapshot };
