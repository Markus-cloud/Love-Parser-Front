export type SegmentStatus = "processing" | "ready" | "failed";

export type AudiencePostFrequency = "daily" | "weekly" | "monthly";

export interface AudienceSegmentFilters {
  engagement_min?: number;
  engagement_max?: number;
  post_frequency?: AudiencePostFrequency;
  language?: string;
  min_subscribers?: number;
}

export interface AudienceSegmentSummary {
  id: string;
  name: string;
  total_recipients: number;
  status: SegmentStatus;
  created_at?: string;
}

export interface AudiencePreviewEntry {
  username: string | null;
  user_id: string | number;
  engagement_score: number;
  activity_level: "low" | "medium" | "high";
}

export interface AudiencePreviewResponse {
  total: number;
  preview: AudiencePreviewEntry[];
}
