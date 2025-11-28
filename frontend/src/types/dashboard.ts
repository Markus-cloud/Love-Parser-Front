export type LimitValue = number | "unlimited";

export type DashboardActivityType = "parsing" | "audience" | "broadcast";
export type DashboardActivityStatus = "completed" | "in_progress" | "failed";

export interface DashboardProfile {
  name: string | null;
  username: string | null;
  photo_url: string | null;
  phone: string | null;
}

export interface DashboardSubscription {
  plan: "free" | "week" | "month" | "year";
  status: "active" | "expired";
  expires_at: string | null;
  renewal_status: "auto" | "manual" | "expired";
}

export interface DashboardLimits {
  parsing_limit: LimitValue;
  parsing_used: number;
  audience_limit: LimitValue;
  audience_used: number;
  broadcast_limit: LimitValue;
  broadcast_used: number;
}

export interface DashboardActivity {
  type: DashboardActivityType;
  name: string;
  created_at: string;
  status: DashboardActivityStatus;
}

export interface DashboardStats {
  total_channels_found: number;
  total_audience_analyzed: number;
  total_broadcasts_sent: number;
  recent_activity: DashboardActivity[];
}

export interface DashboardResponse {
  user_profile: DashboardProfile;
  subscription: DashboardSubscription;
  limits: DashboardLimits;
  stats: DashboardStats;
}
