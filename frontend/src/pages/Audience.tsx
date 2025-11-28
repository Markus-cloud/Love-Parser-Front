import { useMemo, useState } from "react";

import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Users as UsersIcon, Target, Sparkles, Loader2 } from "lucide-react";

import { AuthGuard } from "@/components/AuthGuard";
import { useToast } from "@/hooks/use-toast";
import { useAudience } from "@/hooks/useAudience";
import type { AudiencePostFrequency } from "@/types/audience";

const FALLBACK_BG = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80";

const STATUS_STYLES: Record<string, string> = {
  processing: "bg-amber-500/20 text-amber-500",
  ready: "bg-emerald-500/20 text-emerald-500",
  failed: "bg-destructive/20 text-destructive",
};

export default function Audience() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [engagementMin, setEngagementMin] = useState("");
  const [engagementMax, setEngagementMax] = useState("");
  const [minSubscribers, setMinSubscribers] = useState("");
  const [language, setLanguage] = useState("");
  const [postFrequency, setPostFrequency] = useState<AudiencePostFrequency | "">("");

  const {
    segments,
    segmentsStatus,
    segmentsError,
    refreshSegments,
    parsingSources,
    parsingSourcesStatus,
    parsingSourcesError,
    refreshParsingSources,
    selectedSegmentId,
    selectSegment,
    preview,
    previewStatus,
    previewError,
    refreshPreview,
    createSegment,
  } = useAudience();

  const canSubmit = Boolean(name.trim() && source);

  const parsingOptions = useMemo(() => parsingSources.map((entry) => ({
    label: `${entry.query} (${entry.results_count})`,
    value: entry.id,
  })), [parsingSources]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      toast({ title: "Заполните название и источник", variant: "destructive" });
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      sourceParsingId: source,
      filters: {
        engagementMin: engagementMin ? Number(engagementMin) : undefined,
        engagementMax: engagementMax ? Number(engagementMax) : undefined,
        minSubscribers: minSubscribers ? Number(minSubscribers) : undefined,
        language: language.trim() || undefined,
        postFrequency: postFrequency || undefined,
      },
    } as const;

    await createSegment.mutateAsync(payload);
    setName("");
    setDescription("");
    setSource("");
    setEngagementMin("");
    setEngagementMax("");
    setMinSubscribers("");
    setLanguage("");
    setPostFrequency("");
    refreshSegments();
  };

  const renderSegments = () => {
    if (segmentsStatus === "pending") {
      return (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      );
    }

    if (segmentsError) {
      return (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Не удалось загрузить сегменты</p>
          <Button variant="outline" size="sm" onClick={() => refreshSegments()} className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Повторить
          </Button>
        </div>
      );
    }

    if (segments.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-4">Создайте первый сегмент аудитории</p>;
    }

    return (
      <div className="space-y-3">
        {segments.map((segment) => (
          <button
            key={segment.id}
            onClick={() => selectSegment(segment.id)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
              selectedSegmentId === segment.id ? "border-primary/60 bg-primary/5" : "border-white/10 hover:border-white/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{segment.name}</p>
                <p className="text-xs text-muted-foreground">Получателей: {segment.total_recipients}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[segment.status] ?? "bg-white/10"}`}>
                {segment.status === "ready" ? "Готов" : segment.status === "processing" ? "В работе" : "Ошибка"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Создан: {segment.created_at ? new Date(segment.created_at).toLocaleDateString("ru-RU") : "—"}</p>
          </button>
        ))}
      </div>
    );
  };

  const renderPreview = () => {
    if (!selectedSegmentId) {
      return <p className="text-sm text-muted-foreground">Выберите сегмент для просмотра предпросмотра</p>;
    }

    if (previewStatus === "pending") {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      );
    }

    if (previewError) {
      return (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Не удалось загрузить предпросмотр</p>
          <Button variant="outline" size="sm" onClick={() => refreshPreview()} className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Повторить
          </Button>
        </div>
      );
    }

    if (!preview || preview.preview.length === 0) {
      return <p className="text-sm text-muted-foreground">Предпросмотр пуст</p>;
    }

    return (
      <div className="space-y-2">
        {preview.preview.map((entry) => (
          <div key={`${entry.user_id}-${entry.username}`} className="flex items-center justify-between rounded-2xl border border-white/10 px-3 py-2">
            <div>
              <p className="font-medium text-sm">{entry.username ?? "Без имени"}</p>
              <p className="text-xs text-muted-foreground">ID: {entry.user_id}</p>
            </div>
            <p className="text-xs text-muted-foreground">Engagement: {entry.engagement_score.toFixed(2)}</p>
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
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-accent/20">
                  <UsersIcon className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Новый сегмент</h1>
                  <p className="text-sm text-muted-foreground">Соберите вовлечённую аудиторию</p>
                </div>
              </div>

              <div>
                <Label>Название</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Топ активных" className="mt-1" />
              </div>

              <div>
                <Label>Источник (результаты парсинга)</Label>
                <Select value={source} onValueChange={setSource} disabled={parsingSourcesStatus === "pending"}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={parsingSourcesStatus === "pending" ? "Загрузка..." : "Выберите запрос"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {parsingSourcesError && (
                      <SelectItem value="error" disabled>
                        Ошибка загрузки
                      </SelectItem>
                    )}
                    {parsingOptions.length === 0 && !parsingSourcesError ? (
                      <SelectItem value="empty" disabled>
                        История пуста
                      </SelectItem>
                    ) : (
                      parsingOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {parsingSourcesError && (
                  <Button variant="link" size="sm" className="px-0" onClick={() => refreshParsingSources()}>
                    Обновить источники
                  </Button>
                )}
              </div>

              <div>
                <Label>Описание (необязательно)</Label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Короткое описание сегмента" className="mt-1" />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>Минимальный engagement</Label>
                  <Input value={engagementMin} onChange={(event) => setEngagementMin(event.target.value)} placeholder="0.2" className="mt-1" />
                </div>
                <div>
                  <Label>Максимальный engagement</Label>
                  <Input value={engagementMax} onChange={(event) => setEngagementMax(event.target.value)} placeholder="0.8" className="mt-1" />
                </div>
                <div>
                  <Label>Мин. подписчиков</Label>
                  <Input value={minSubscribers} onChange={(event) => setMinSubscribers(event.target.value)} placeholder="500" className="mt-1" />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Язык</Label>
                  <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="ru" className="mt-1" />
                </div>
                <div>
                  <Label>Частота публикаций</Label>
                  <Select value={postFrequency} onValueChange={(value: AudiencePostFrequency | "") => setPostFrequency(value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Любая" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Любая</SelectItem>
                      <SelectItem value="daily">Ежедневно</SelectItem>
                      <SelectItem value="weekly">Еженедельно</SelectItem>
                      <SelectItem value="monthly">Ежемесячно</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={!canSubmit || createSegment.isPending}>
                {createSegment.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Создаём сегмент
                  </>
                ) : (
                  <>
                    <Target className="h-4 w-4 mr-2" /> Создать сегмент
                  </>
                )}
              </Button>
            </form>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Ваши сегменты
              </h3>
              <Button variant="ghost" size="icon" onClick={() => refreshSegments()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {renderSegments()}
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-accent" /> Предпросмотр аудитории
              </h3>
              <Button variant="ghost" size="icon" onClick={() => refreshPreview()} disabled={!selectedSegmentId}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {renderPreview()}
          </GlassCard>
        </div>
      </Layout>
    </AuthGuard>
  );
}
