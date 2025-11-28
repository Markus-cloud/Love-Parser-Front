import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createBroadcastCampaign,
  getBroadcastHistory,
  getBroadcastLogs,
  getBroadcastProgressUrl,
  retryBroadcastCampaign,
  startBroadcastCampaign,
  type CreateBroadcastCampaignPayload,
} from "@/api/broadcast.service";
import type { BroadcastHistoryEntry, BroadcastLogEntry, BroadcastProgressSnapshot } from "@/types/broadcast";
import { useToast } from "@/hooks/use-toast";
import { useSSE } from "@/hooks/useSSE";

const HISTORY_QUERY_KEY = ["broadcast", "history"] as const;

function resolveCampaignId(snapshot: BroadcastProgressSnapshot, fallback?: string | null) {
  return snapshot.campaignId ?? snapshot.campaign_id ?? fallback ?? null;
}

export function useBroadcast() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: () => getBroadcastHistory({ limit: 10 }),
  });

  const historyItems = useMemo<BroadcastHistoryEntry[]>(() => historyQuery.data?.items ?? [], [historyQuery.data]);

  useEffect(() => {
    if (!selectedCampaignId && historyItems.length > 0) {
      setSelectedCampaignId(historyItems[0].id);
    }
  }, [historyItems, selectedCampaignId]);

  useEffect(() => {
    const running = historyItems.find((entry) => entry.status === "in_progress");
    if (running) {
      setActiveCampaignId(running.id);
      return;
    }

    if (activeCampaignId && !historyItems.some((entry) => entry.id === activeCampaignId && entry.status === "in_progress")) {
      setActiveCampaignId(null);
    }
  }, [historyItems, activeCampaignId]);

  const logsQuery = useQuery({
    queryKey: ["broadcast", "logs", selectedCampaignId],
    queryFn: () => (selectedCampaignId ? getBroadcastLogs(selectedCampaignId, { limit: 25 }) : null),
    enabled: Boolean(selectedCampaignId),
  });

  const createCampaign = useMutation({
    mutationFn: (payload: CreateBroadcastCampaignPayload) => createBroadcastCampaign(payload),
    onSuccess: (result) => {
      toast({ title: "Кампания создана", description: "Теперь её можно запустить" });
      setSelectedCampaignId(result.campaign_id);
      setActiveCampaignId(result.campaign_id);
      void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Не удалось создать кампанию";
      toast({ title: "Ошибка создания", description: message, variant: "destructive" });
    },
  });

  const startCampaign = useMutation({
    mutationFn: (campaignId: string) => startBroadcastCampaign(campaignId),
    onSuccess: (result) => {
      toast({ title: "Рассылка запущена", description: `Отправляем ${result.total} сообщений` });
      setActiveCampaignId(result.campaign_id);
      void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Не удалось запустить кампанию";
      toast({ title: "Ошибка запуска", description: message, variant: "destructive" });
    },
  });

  const retryCampaign = useMutation({
    mutationFn: (campaignId: string) => retryBroadcastCampaign(campaignId, { retryOnlyFailed: true }),
    onSuccess: (result) => {
      toast({ title: "Повторная отправка", description: "Перезапускаем кампанию" });
      setActiveCampaignId(result.campaign_id);
      void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      if (selectedCampaignId === result.campaign_id) {
        void queryClient.invalidateQueries({ queryKey: ["broadcast", "logs", result.campaign_id] });
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Не удалось повторить кампанию";
      toast({ title: "Ошибка", description: message, variant: "destructive" });
    },
  });

  const { data: progress, error: progressError, isConnected: isProgressStreaming, reconnect: reconnectProgress } = useSSE<BroadcastProgressSnapshot>(
    {
      url: activeCampaignId ? getBroadcastProgressUrl(activeCampaignId) : null,
      enabled: Boolean(activeCampaignId),
      onMessage: (snapshot) => {
        const campaignId = resolveCampaignId(snapshot, activeCampaignId);
        if (snapshot.status === "completed" || snapshot.status === "failed") {
          if (campaignId && campaignId === activeCampaignId) {
            setActiveCampaignId(null);
          }
          void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
          if (campaignId) {
            void queryClient.invalidateQueries({ queryKey: ["broadcast", "logs", campaignId] });
          }
        }
      },
    },
  );

  const logs = useMemo<BroadcastLogEntry[]>(() => logsQuery.data?.items ?? [], [logsQuery.data]);

  return {
    history: historyItems,
    historyStatus: historyQuery.status,
    historyError: historyQuery.error,
    refreshHistory: historyQuery.refetch,
    logs,
    logsStatus: logsQuery.status,
    logsError: logsQuery.error,
    refreshLogs: logsQuery.refetch,
    selectedCampaignId,
    selectCampaign: setSelectedCampaignId,
    activeCampaignId,
    createCampaign,
    startCampaign,
    retryCampaign,
    progress,
    progressError,
    isProgressStreaming,
    reconnectProgress,
  } as const;
}
