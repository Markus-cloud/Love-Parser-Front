import apiClient from "./client";

import type { AuthUser } from "@/types/auth";

export interface SendCodeResponse {
  auth_session_id: string;
  phone_code_hash: string;
}

interface VerifyCodePayload {
  auth_session_id: string;
  code: string;
  password?: string;
}

interface VerifyCodeResponse {
  access_token?: string;
  user?: AuthUser;
}

export async function sendCode(phoneNumber: string) {
  return apiClient.post<SendCodeResponse>("/api/v1/telegram/auth/send-code", {
    phone_number: phoneNumber.trim(),
  });
}

export async function verifyCode(payload: VerifyCodePayload) {
  return apiClient.post<VerifyCodeResponse>("/api/v1/telegram/auth/verify-code", payload);
}

export async function fetchCurrentUser() {
  return apiClient.get<AuthUser>("/api/v1/auth/me");
}

export async function logoutRequest() {
  return apiClient.get<{ success: boolean }>("/api/v1/auth/logout");
}
