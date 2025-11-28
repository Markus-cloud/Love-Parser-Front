import { useCallback, useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createParsingSearch,
  exportParsingResults,
  getParsingHistory,
  getParsingProgressUrl,
  getParsingResults,
  type CreateParsingSearchPayload,
} from "@/api/parsing.service";
import type { ParsingProgressSnapshot, ParsingResultsResponse } from "@/types/parsing";
import { useToast } from "@/hooks/use-toast";
import { useSSE } from "@/hooks/useSSE";

const HISTORY_QUERY_KEY = ["parsing", "history"] as const;

export function useParsing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null);
  const [trackedSearchId, setTrackedSearchId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: () => getParsingHistory({ limit: 20 }),
  });

  useEffect(() => {
    if (!selectedSearchId && historyQuery.data && historyQuery.data.length > 0) {
      setSelectedSearchId(historyQuery.data[0].id);
    }
  }, [historyQuery.data, selectedSearchId]);

  useEffect(() => {
    if (!selectedSearchId) {
      return;
    }

    const current = historyQuery.data?.find((entry) => entry.id === selectedSearchId);
    if (!current) {
      return;
    }

    if (current.status === "pending" || current.status === "processing") {
      setTrackedSearchId(selectedSearchId);
    } else if (trackedSearchId === selectedSearchId && (current.status === "completed" || current.status === "failed")) {
      setTrackedSearchId(null);
    }
  }, [historyQuery.data, selectedSearchId, trackedSearchId]);

  const resultsQuery = useQuery({
    queryKey: ["parsing", "results", selectedSearchId],
    queryFn: () => (selectedSearchId ? getParsingResults(selectedSearchId, { limit: 25 }) : null),
    enabled: Boolean(selectedSearchId),
  });

  const startSearch = useMutation({
    mutationFn: (payload: CreateParsingSearchPayload) => createParsingSearch(payload),
    onSuccess: (response) => {
      setSelectedSearchId(response.search_id);
      setTrackedSearchId(response.search_id);
      void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      toast({ title: "Поиск запущен", description: "Мы сообщим, когда данные будут готовы" });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Не удалось запустить поиск";
      toast({ title: "Ошибка запуска", description: message, variant: "destructive" });
    },
  });

  const { data: progress, error: progressError, isConnected: isProgressStreaming, reconnect: reconnectProgress } = useSSE<ParsingProgressSnapshot>(
    {
      url: trackedSearchId ? getParsingProgressUrl(trackedSearchId) : null,
      enabled: Boolean(trackedSearchId),
      onMessage: (snapshot) => {
        const terminal = snapshot.status === "completed" || snapshot.status === "failed";
        if (terminal) {
          setTrackedSearchId((current) => (current === trackedSearchId ? null : current));
          void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
          if (snapshot.searchId || trackedSearchId) {
            const targetId = snapshot.searchId ?? trackedSearchId;
            void queryClient.invalidateQueries({ queryKey: ["parsing", "results", targetId] });
          }
        }
      },
    },
  );

  const exportResults = useCallback(
    (searchId?: string) => {
      const targetId = searchId ?? selectedSearchId;
      if (!targetId) {
        return Promise.reject(new Error("Поиск не выбран"));
      }
      return exportParsingResults(targetId);
    },
    [selectedSearchId],
  );

  const history = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);

  const results = useMemo<ParsingResultsResponse | null>(() => resultsQuery.data ?? null, [resultsQuery.data]);

  return {
    history,
    historyStatus: historyQuery.status,
    historyError: historyQuery.error,
    refreshHistory: historyQuery.refetch,
    selectedSearchId,
    selectSearch: setSelectedSearchId,
    startSearch,
    results,
    resultsStatus: resultsQuery.status,
    resultsError: resultsQuery.error,
    refreshResults: resultsQuery.refetch,
    progress,
    progressError,
    isProgressStreaming,
    reconnectProgress,
    exportResults,
  } as const;
}
