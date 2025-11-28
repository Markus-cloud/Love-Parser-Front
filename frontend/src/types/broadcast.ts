export type BroadcastStatus = "draft" | "in_progress" | "completed" | "failed";
export type BroadcastLogStatus = "sent" | "failed" | "blocked";

export interface BroadcastMessage {
  text: string;
  image?: string | null;
}

export interface BroadcastDelayConfig {
  min_ms: number;
  max_ms: number;
}

export interface BroadcastHistoryEntry {
  id: string;
  title?: string | null;
  audience_name?: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  blocked_count: number;
  status: BroadcastStatus;
  created_at: string;
}

export interface BroadcastLogEntry {
  id: string;
  recipient_username: string | null;
  recipient_id: string | null;
  status: BroadcastLogStatus;
  error_code?: string | null;
  error_message?: string | null;
  sent_at: string;
}

export interface BroadcastProgressSnapshot {
  campaignId?: string;
  campaign_id?: string;
  status: BroadcastStatus;
  sent: number;
  failed: number;
  blocked: number;
  total: number;
  progress: number;
  eta_seconds: number | null;
  last_error?: string | null;
  updated_at: string;
}
