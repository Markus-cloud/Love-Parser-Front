export type BroadcastStatus = "draft" | "in_progress" | "completed" | "failed";

export interface BroadcastMessage {
  text: string;
  image?: string | null;
}

export interface BroadcastDelayConfig {
  min_ms: number;
  max_ms: number;
}

export interface BroadcastCampaign {
  id: string;
  userId: string;
  segmentId?: string | null;
  targetType: "segment" | "manual";
  manualRecipients: string[];
  message: BroadcastMessage;
  delay: BroadcastDelayConfig;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  status: BroadcastStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  jobId?: string | null;
}

export type BroadcastLogStatus = "sent" | "failed" | "blocked";

export interface BroadcastLogEntry {
  id: string;
  campaignId: string;
  userId?: string | null;
  recipientUsername: string;
  recipientId?: string | null;
  status: BroadcastLogStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  sentAt: string;
}

export interface BroadcastHistoryEntry {
  id: string;
  audienceName: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  status: BroadcastStatus;
  createdAt: string;
}

export interface BroadcastProgressSnapshot {
  campaignId: string;
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
