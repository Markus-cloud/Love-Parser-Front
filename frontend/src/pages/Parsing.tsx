import { useMemo, useState } from "react";

import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, Loader2, RefreshCw, Search } from "lucide-react";

import { AuthGuard } from "@/components/AuthGuard";
import { useToast } from "@/hooks/use-toast";
import { useParsing } from "@/hooks/useParsing";
import { useCSVExport } from "@/hooks/useCSVExport";
import type { CreateParsingSearchPayload } from "@/api/parsing.service";
import type { ActivityLevel } from "@/types/parsing";

const STATUS_LABELS: Record<string, string> = {
  pending: "В ожидании",
  processing: "Обработка",
  completed: "Завершён",
  failed: "Ошибка",
};

const PROGRESS_LABELS: Record<string, string> = {
  pending: "Ожидание",
  initializing: "Инициализация",
  scanning_channels: "Сканирование каналов",
  analyzing_data: "Анализ данных",
  completed: "Завершено",
  failed: "Ошибка",
};

const TERMINAL_PROGRESS = new Set(["completed", "failed"]);
const FALLBACK_BG = "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1600&q=80";

export default function Parsing() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [minSubscribers, setMinSubscribers] = useState("");
  const [maxSubscribers, setMaxSubscribers] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">("");

  const {
    history,
    historyStatus,
    historyError,
    refreshHistory,
    selectedSearchId,
    selectSearch,
    startSearch,
    results,
    resultsStatus,
    resultsError,
    refreshResults,
    progress,
    progressError,
    isProgressStreaming,
    reconnectProgress,
    exportResults,
  } = useParsing();
  const { download, isDownloading } = useCSVExport({ defaultFileName: "parsing-results.csv" });

  const hasResults = Boolean(results && results.results.length > 0);
  const showProgressCard = Boolean(progress && !TERMINAL_PROGRESS.has(progress.status));

  const handleStartSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      toast({ title: "Введите запрос", description: "Добавьте ключевые слова для поиска", variant: "destructive" });
      return;
    }

    const payload: CreateParsingSearchPayload = {
      query: query.trim(),
      filters: {
        language: language || undefined,
        minSubscribers: minSubscribers ? Number(minSubscribers) : undefined,
        maxSubscribers: maxSubscribers ? Number(maxSubscribers) : undefined,
        activityLevel: activityLevel || undefined,
      },
    };

    await startSearch.mutateAsync(payload);
    refreshHistory();
  };

  const handleExport = async () => {
    if (!selectedSearchId) {
      toast({ title: "Выберите поиск", description: "Выберите запрос из истории", variant: "destructive" });
      return;
    }

    await download({
      fileName: `parsing-${selectedSearchId}.csv`,
      getFile: () => exportResults(selectedSearchId),
    });
  };

  const historyContent = useMemo(() => {
    if (historyStatus === "pending") {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-14 w-full rounded-xl" />
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
      return <p className="text-sm text-muted-foreground text-center py-4">История запросов пуста</p>;
    }

    return (
      <div className="space-y-2">
        {history.map((entry) => (
          <button
            key={entry.id}
            onClick={() => selectSearch(entry.id)}
            className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
              selectedSearchId === entry.id ? "border-primary/40 bg-primary/5" : "border-white/10 hover:border-white/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-sm line-clamp-1">{entry.query}</p>
                <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString("ru-RU")}</p>
              </div>
              <span
                className={`text-xs font-medium ${
                  entry.status === "completed"
                    ? "text-emerald-400"
                    : entry.status === "failed"
                      ? "text-destructive"
                      : "text-amber-400"
                }`}
              >
                {STATUS_LABELS[entry.status] ?? entry.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Результатов: {entry.results_count}</p>
          </button>
        ))}
      </div>
    );
  }, [history, historyError, historyStatus, refreshHistory, selectSearch, selectedSearchId]);

  const resultsContent = useMemo(() => {
    if (resultsStatus === "pending") {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      );
    }

    if (resultsError) {
      return (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Не удалось загрузить результаты</p>
          <Button variant="outline" size="sm" onClick={() => refreshResults()} className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Повторить
          </Button>
        </div>
      );
    }

    if (!hasResults) {
      return (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-60" />
          Результаты появятся после завершения поиска
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {results!.results.map((channel) => (
          <div key={channel.channel_id} className="rounded-2xl border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{channel.title ?? "Без названия"}</p>
                <p className="text-xs text-muted-foreground">{channel.username ?? "—"}</p>
              </div>
              <p className="text-sm text-muted-foreground">{channel.subscribers.toLocaleString("ru-RU")} подписчиков</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{channel.description ?? ""}</p>
          </div>
        ))}
      </div>
    );
  }, [results, resultsError, resultsStatus, refreshResults, hasResults]);

  return (
    <AuthGuard>
      <Layout backgroundImage={FALLBACK_BG}>
        <div className="space-y-6 max-w-3xl mx-auto animate-slide-up">
          <GlassCard>
            <form onSubmit={handleStartSearch} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-primary/20">
                  <Search className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Поиск каналов</h1>
                  <p className="text-sm text-muted-foreground">Используйте фильтры, чтобы сузить выдачу</p>
                </div>
              </div>

              <div>
                <Label>Ключевые слова</Label>
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например: бизнес, маркетинг" className="mt-1" />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Минимум подписчиков</Label>
                  <Input type="number" value={minSubscribers} onChange={(event) => setMinSubscribers(event.target.value)} placeholder="1000" className="mt-1" />
                </div>
                <div>
                  <Label>Максимум подписчиков</Label>
                  <Input type="number" value={maxSubscribers} onChange={(event) => setMaxSubscribers(event.target.value)} placeholder="100000" className="mt-1" />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Язык</Label>
                  <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="ru, en, es..." className="mt-1" />
                </div>
                <div>
                  <Label>Активность</Label>
                  <Select onValueChange={(value: ActivityLevel | "") => setActivityLevel(value)} value={activityLevel ?? ""}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Любая" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Любая</SelectItem>
                      <SelectItem value="low">Низкая</SelectItem>
                      <SelectItem value="medium">Средняя</SelectItem>
                      <SelectItem value="high">Высокая</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit" disabled={startSearch.isPending} className="w-full mt-2">
                {startSearch.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Запускаем поиск
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Найти каналы
                  </>
                )}
              </Button>
            </form>
          </GlassCard>

          {showProgressCard && progress && (
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold">Текущий прогресс</p>
                  <p className="text-xs text-muted-foreground">{PROGRESS_LABELS[progress.status] ?? progress.status}</p>
                </div>
                <span className="text-sm font-medium">{progress.progress}%</span>
              </div>
              <Progress value={progress.progress} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                <span>Обработано {progress.current ?? 0}</span>
                <span>Всего {progress.total ?? 0}</span>
              </div>
              <p className={`text-xs mt-2 ${isProgressStreaming ? "text-emerald-400" : "text-muted-foreground"}`}>
                {isProgressStreaming ? "Трансляция в реальном времени" : "Ожидаем следующее обновление"}
              </p>
              {progressError && (
                <div className="mt-3 text-xs text-destructive flex items-center gap-2">
                  {progressError.message}
                  <Button variant="link" size="sm" onClick={() => reconnectProgress()} className="px-0">
                    Повторить
                  </Button>
                </div>
              )}
            </GlassCard>
          )}

          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Результаты</h3>
                <p className="text-xs text-muted-foreground">{hasResults ? `${results!.results.length} каналов` : "Нет данных"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => refreshResults()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={!hasResults || isDownloading} className="gap-2">
                  {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Экспорт CSV
                </Button>
              </div>
            </div>
            {resultsContent}
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">История</h3>
              <Button variant="ghost" size="icon" onClick={() => refreshHistory()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {historyContent}
          </GlassCard>
        </div>
      </Layout>
    </AuthGuard>
  );
}
