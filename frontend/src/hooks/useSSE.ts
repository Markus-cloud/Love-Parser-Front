import { useCallback, useEffect, useRef, useState } from "react";

import { getAccessToken } from "@/api/client";

export interface UseSSEOptions<T> {
  url: string | null;
  enabled?: boolean;
  parser?: (payload: string) => T;
  onMessage?: (data: T) => void;
  onError?: (error: Error) => void;
  reconnect?: boolean;
  retryInterval?: number;
}

export interface UseSSEResult<T> {
  data: T | null;
  isConnected: boolean;
  error: Error | null;
  reconnect: () => void;
}

const DEFAULT_RETRY_MS = 4000;

export function useSSE<T = unknown>({
  url,
  enabled = true,
  parser,
  onMessage,
  onError,
  reconnect = true,
  retryInterval = DEFAULT_RETRY_MS,
}: UseSSEOptions<T>): UseSSEResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parserRef = useRef<(payload: string) => T | null>();
  const onMessageRef = useRef<typeof onMessage>();
  const onErrorRef = useRef<typeof onError>();

  parserRef.current = parser ?? ((payload) => JSON.parse(payload) as T);
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;

  const manualReconnect = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!url || enabled === false || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    const cleanupTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!reconnect || retryInterval <= 0) {
        return;
      }

      cleanupTimer();
      retryTimerRef.current = setTimeout(() => {
        if (!cancelled) {
          setNonce((value) => value + 1);
        }
      }, retryInterval);
    };

    const listen = async () => {
      setIsConnected(false);
      setError(null);

      try {
        const headers: Record<string, string> = {};
        const token = getAccessToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed (${response.status})`);
        }

        setIsConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          let separator = buffer.indexOf("\n\n");

          while (separator !== -1) {
            const rawEvent = buffer.slice(0, separator).trim();
            buffer = buffer.slice(separator + 2);

            if (rawEvent.startsWith("data:")) {
              const payload = rawEvent
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.replace(/^data:\s*/, ""))
                .join("\n");

              if (payload) {
                try {
                  const parsed = parserRef.current ? parserRef.current(payload) : (payload as unknown as T);
                  if (parsed !== null && parsed !== undefined) {
                    setData(parsed);
                    onMessageRef.current?.(parsed);
                  }
                } catch (parseError) {
                  const normalized =
                    parseError instanceof Error ? parseError : new Error("Не удалось обработать событие прогресса");
                  setError(normalized);
                  onErrorRef.current?.(normalized);
                }
              }
            }

            separator = buffer.indexOf("\n\n");
          }
        }

        setIsConnected(false);
        if (!cancelled) {
          scheduleReconnect();
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        const normalized = err instanceof Error ? err : new Error(String(err));
        setIsConnected(false);
        setError(normalized);
        onErrorRef.current?.(normalized);
        scheduleReconnect();
      }
    };

    void listen();

    return () => {
      cancelled = true;
      cleanupTimer();
      controller.abort();
    };
  }, [url, enabled, reconnect, retryInterval, nonce]);

  return {
    data,
    isConnected,
    error,
    reconnect: manualReconnect,
  };
}
