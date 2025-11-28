import apiClient from "./client";

import type { DashboardResponse } from "@/types/dashboard";

export async function getDashboard() {
  return apiClient.get<DashboardResponse>("/api/v1/dashboard");
}
