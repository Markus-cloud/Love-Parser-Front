export type SubscriptionPlanType = "free" | "week" | "month" | "year";

export interface SubscriptionPlan {
  type: SubscriptionPlanType;
  name: string;
  price: number;
  currency: string;
  limits: Record<string, number | string | null>;
}

export interface SubscriptionPlansResponse {
  plans: SubscriptionPlan[];
}

export interface PurchaseSubscriptionResponse {
  payment_id: string;
  robokassa_url: string;
  order_id: string;
}

export interface CurrentSubscription {
  plan_type: SubscriptionPlanType;
  status: "active" | "expired" | string;
  expires_at: string | null;
  renewal_status: "auto" | "manual" | "expired";
  auto_renewal_enabled: boolean;
}
