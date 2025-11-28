import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";

type ErrorPayload = {
  message?: string;
  error?: { message?: string; code?: string } | string;
  code?: string;
  status_code?: number;
};

const TOKEN_STORAGE_KEY = "love_parser_access_token";
const MAX_SERVER_RETRIES = 2;
const RETRY_DELAY_MS = 400;

const isBrowser = typeof window !== "undefined";
const rawBaseUrl = (import.meta.env.VITE_API_URL ?? import.meta.env.API_URL ?? (isBrowser ? window.location.origin : "")).trim();
export const API_BASE_URL = rawBaseUrl.replace(/\/$/, "");

let inMemoryToken: string | null = null;

function safeReadToken() {
  if (!isBrowser) {
    return null;
  }

  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistToken(token: string | null) {
  if (!isBrowser) {
    return;
  }

  try {
    if (!token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // ignore storage errors
  }
}

export function getAccessToken() {
  if (inMemoryToken !== null) {
    return inMemoryToken;
  }

  inMemoryToken = safeReadToken();
  return inMemoryToken;
}

export function setAccessToken(token: string | null) {
  inMemoryToken = token;
  persistToken(token);
}

export class ApiError extends Error {
  status?: number;
  data?: unknown;
  code?: string;

  constructor(message: string, options?: { status?: number; data?: unknown; code?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status;
    this.data = options?.data;
    this.code = options?.code;
  }
}

function buildApiError(error: AxiosError) {
  const status = error.response?.status ?? error.status;
  const data = error.response?.data;
  let message = error.message || "Request failed";
  let code: string | undefined;

  if (data) {
    if (typeof data === "string") {
      message = data;
    } else if (typeof data === "object") {
      const payload = data as ErrorPayload;
      if (typeof payload.error === "string") {
        message = payload.error;
      } else if (payload.error && typeof payload.error === "object" && payload.error.message) {
        message = payload.error.message;
        code = payload.error.code ?? payload.code;
      } else if (payload.message) {
        message = payload.message;
      }

      code = code ?? payload.code;
    }
  }

  if (!message && error.request) {
    message = "Сервер временно недоступен";
  }

  return new ApiError(message || "Неизвестная ошибка", { status, data, code });
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL || "/",
  timeout: 30_000,
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const config = error.config as (AxiosRequestConfig & { __retryCount?: number }) | undefined;
    const status = error.response?.status ?? error.status;
    const shouldRetry = status && status >= 500 && status < 600;

    if (shouldRetry && config) {
      config.__retryCount = config.__retryCount ?? 0;
      if (config.__retryCount < MAX_SERVER_RETRIES) {
        config.__retryCount += 1;
        await wait(RETRY_DELAY_MS * config.__retryCount);
        return apiClient(config);
      }
    }

    throw buildApiError(error);
  },
);

export default apiClient;
