import apiClient from "./client";

import type {
  CurrentSubscription,
  PurchaseSubscriptionResponse,
  SubscriptionPlan,
  SubscriptionPlanType,
  SubscriptionPlansResponse,
} from "@/types/subscription";

export async function getSubscriptionPlans() {
  const response = await apiClient.get<SubscriptionPlansResponse>("/api/v1/subscriptions/plans");
  return response.plans;
}

export async function purchaseSubscription(planType: Exclude<SubscriptionPlanType, "free">) {
  return apiClient.post<PurchaseSubscriptionResponse>("/api/v1/subscriptions/purchase", {
    plan_type: planType,
  });
}

export async function getCurrentSubscription() {
  return apiClient.get<CurrentSubscription>("/api/v1/subscriptions/current");
}
