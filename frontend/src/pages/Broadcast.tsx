import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { FileText, History, Loader2, RefreshCw, Send, Users as UsersIcon } from "lucide-react";

import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthGuard } from "@/components/AuthGuard";
import { useToast } from "@/hooks/use-toast";
import { useBroadcast } from "@/hooks/useBroadcast";
import { getAudienceSegments } from "@/api/audience.service";

const FALLBACK_BG = "https://images.unsplash.com/photo-1474631245212-32dc3c8310c6?auto=format&fit=crop&w=1600&q=80";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/20 text-amber-500",
  completed: "bg-emerald-500/20 text-emerald-500",
  failed: "bg-destructive/20 text-destructive",
};

const LOG_STATUS: Record<string, string> = {
  sent: "text-emerald-400",
  failed: "text-destructive",
  blocked: "text-amber-400",
};

export default function Broadcast() {
  const { toast } = useToast();
  const [segmentId, setSegmentId] = useState("");
  const [manualRecipients, setManualRecipients] = useState("");
  const [message, setMessage] = useState("");

  const segmentsQuery = useQuery({
    queryKey: ["broadcast", "segments"],
    queryFn: () => getAudienceSegments({ limit: 20 }),
    staleTime: 60_000,
  });

  const segments = segmentsQuery.data ?? [];

  const {
    history,
    historyStatus,
    historyError,
    refreshHistory,
    logs,
    logsStatus,
    logsError,
    refreshLogs,
    selectedCampaignId,
    selectCampaign,
    createCampaign,
    startCampaign,
    retryCampaign,
    progress,
    progressError,
    isProgressStreaming,
    reconnectProgress,
  } = useBroadcast();

  const activeLogs = useMemo(() => logs ?? [], [logs]);

  const parsedRecipients = useMemo(() =>
    manualRecipients
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => (entry.startsWith("@") ? entry : `@${entry}`)),
  [manualRecipients]);

  const hasTargets = Boolean(segmentId || parsedRecipients.length);

  const handleLaunch = async () => {
    if (!message.trim()) {
      toast({ title: "Добавьте текст сообщения", variant: "destructive" });
      return;
    }

    if (!hasTargets) {
      toast({ title: "Добавьте получателей", description: "Выберите сегмент или укажите никнеймы", variant: "destructive" });
      return;
    }

    try {
      const created = await createCampaign.mutateAsync({
        segmentId: segmentId || undefined,
        manualRecipients: parsedRecipients,
        message: { text: message.trim() },
      });

      await startCampaign.mutateAsync(created.campaign_id);
      toast({ title: "Кампания запущена" });
      refreshHistory();
      refreshLogs();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Не удалось запустить рассылку";
      toast({ title: "Ошибка", description, variant: "destructive" });
    }
  };

  const handleRetry = async (campaignId: string) => {
    await retryCampaign.mutateAsync(campaignId);
    refreshHistory();
    refreshLogs();
  };

  const renderHistory = () => {
    if (historyStatus === "pending") {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      );
    }

    if (historyError) {
      return (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Не удалось загрузить историю</p>
          <Button variant="outline" size="sm" onClick={() => refreshHistory()} className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Повторить
          </Button>
        </div>
      );
    }

    if (history.length === 0) {
      return <p className="text-sm text-muted-foreground text-center">Нет кампаний</p>;
    }

    return (
      <div className="space-y-3">
        {history.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-2xl border px-4 py-3 ${selectedCampaignId === entry.id ? "border-primary/60 bg-primary/5" : "border-white/10"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{entry.audience_name ?? "Кампания"}</p>
                <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString("ru-RU")}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_BADGE[entry.status] ?? "bg-white/10"}`}>
                {entry.status === "in_progress"
                  ? "В процессе"
                  : entry.status === "completed"
                    ? "Завершена"
                    : entry.status === "failed"
                      ? "Ошибка"
                      : "Черновик"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>Отправлено: {entry.sent_count}</span>
              <span>Ошибки: {entry.failed_count}</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => selectCampaign(entry.id)}>
                Просмотр
              </Button>
              {entry.status === "failed" && (
                <Button variant="ghost" size="sm" onClick={() => handleRetry(entry.id)} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Повторить
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderLogs = () => {
    if (!selectedCampaignId) {
      return <p className="text-sm text-muted-foreground">Выберите кампанию для просмотра логов</p>;
    }

    if (logsStatus === "pending") {
      return (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      );
    }

    if (logsError) {
      return (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Не удалось загрузить логи</p>
          <Button variant="outline" size="sm" onClick={() => refreshLogs()} className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Повторить
          </Button>
        </div>
      );
    }

    if (activeLogs.length === 0) {
      return <p className="text-sm text-muted-foreground">Логи будут доступны после запуска кампании</p>;
    }

    return (
      <div className="space-y-2">
        {activeLogs.map((log) => (
          <div key={log.id} className="flex items-center justify-between rounded-2xl border border-white/10 px-3 py-2">
            <div>
              <p className="font-medium text-sm">{log.recipient_username ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{new Date(log.sent_at).toLocaleString("ru-RU")}</p>
            </div>
            <span className={`text-xs font-semibold ${LOG_STATUS[log.status] ?? "text-muted-foreground"}`}>
              {log.status === "sent" ? "Отправлено" : log.status === "blocked" ? "Заблокировано" : "Ошибка"}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AuthGuard>
      <Layout backgroundImage={FALLBACK_BG}>
        <div className="space-y-6 max-w-3xl mx-auto animate-slide-up">
          <GlassCard>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-primary/20">
                <Send className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Рассылка</h1>
                <p className="text-sm text-muted-foreground">Создайте кампанию и отслеживайте прогресс</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm">Сегмент аудитории</Label>
                <Select value={segmentId} onValueChange={setSegmentId} disabled={segmentsQuery.isLoading}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Выберите сегмент" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Без сегмента</SelectItem>
                    {segments.length === 0 ? (
                      <SelectItem value="__empty" disabled>
                        Нет доступных сегментов
                      </SelectItem>
                    ) : (
                      segments.map((segment) => (
                        <SelectItem key={segment.id} value={segment.id}>
                          {segment.name} ({segment.total_recipients})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">Никнеймы вручную</Label>
                <Textarea
                  value={manualRecipients}
                  onChange={(event) => setManualRecipients(event.target.value)}
                  placeholder="@username1, @username2"
                  className="mt-1 min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground mt-1">Вводите никнеймы через запятую или с новой строки</p>
              </div>

              <div>
                <Label className="text-sm">Текст сообщения</Label>
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Напишите сообщение..."
                  className="mt-1 min-h-[140px]"
                  maxLength={4096}
                />
                <p className="text-xs text-muted-foreground mt-1">{message.length} / 4096 символов</p>
              </div>

              <Button className="w-full" disabled={createCampaign.isPending || startCampaign.isPending} onClick={handleLaunch}>
                {createCampaign.isPending || startCampaign.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Запуск кампании
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" /> Запустить рассылку
                  </>
                )}
              </Button>
            </div>
          </GlassCard>

          {progress && (
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold">Прогресс кампании</p>
                  <p className="text-xs text-muted-foreground">{progress.status === "in_progress" ? "В процессе" : progress.status === "completed" ? "Завершено" : "Ошибка"}</p>
                </div>
                <span className="text-sm font-medium">{progress.progress}%</span>
              </div>
              <Progress value={progress.progress} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                <span>Отправлено {progress.sent}</span>
                <span>Всего {progress.total}</span>
              </div>
              <p className={`text-xs mt-2 ${isProgressStreaming ? "text-emerald-400" : "text-muted-foreground"}`}>
                {isProgressStreaming ? "Трансляция в реальном времени" : "Соединение потеряно"}
              </p>
              {progressError && (
                <div className="mt-3 text-xs text-destructive flex items-center gap-2">
                  {progressError.message}
                  <Button variant="link" size="sm" className="px-0" onClick={() => reconnectProgress()}>
                    Повторить
                  </Button>
                </div>
              )}
            </GlassCard>
          )}

          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-primary" /> История кампаний
              </h3>
              <Button variant="ghost" size="icon" onClick={() => refreshHistory()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {renderHistory()}
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" /> Логи кампании
              </h3>
              <Button variant="ghost" size="icon" onClick={() => refreshLogs()} disabled={!selectedCampaignId}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {renderLogs()}
          </GlassCard>
        </div>
      </Layout>
    </AuthGuard>
  );
}
