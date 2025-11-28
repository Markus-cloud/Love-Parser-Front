export type ActivityLevel = "low" | "medium" | "high";

export type ParsingStatus = "pending" | "processing" | "completed" | "failed";

export type ParsingProgressStatus =
  | "pending"
  | "initializing"
  | "scanning_channels"
  | "analyzing_data"
  | "completed"
  | "failed";

export interface ParsingFilters {
  language?: string | null;
  min_subscribers?: number | null;
  max_subscribers?: number | null;
  activity_level?: ActivityLevel;
}

export interface ParsingSearchResponse {
  search_id: string;
  status: ParsingStatus;
  progress: number;
}

export interface ParsingHistoryItem {
  id: string;
  query: string;
  filters: ParsingFilters | null;
  status: ParsingStatus;
  created_at: string;
  results_count: number;
}

export interface ParsingResultItem {
  channel_id: string;
  title: string | null;
  username: string | null;
  subscribers: number;
  description: string | null;
  activity_score: number;
  activity_level: ActivityLevel;
  last_post: string | null;
}

export interface ParsingResultsResponse {
  total: number;
  page: number;
  limit: number;
  results: ParsingResultItem[];
}

export interface ParsingProgressSnapshot {
  searchId?: string;
  progress: number;
  status: ParsingProgressStatus;
  current?: number;
  total?: number;
  results?: number;
  error?: string | null;
  updated_at: string;
}
