import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, Crown, LogOut, RefreshCw, Send, Users } from "lucide-react";

import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getDashboard } from "@/api/dashboard.service";
import { getSubscriptionPlans, purchaseSubscription } from "@/api/subscription.service";
import type { DashboardResponse, LimitValue } from "@/types/dashboard";
import type { SubscriptionPlan, SubscriptionPlanType } from "@/types/subscription";

const FALLBACK_BG = "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1600&q=80";

interface NormalizedPlan {
  type: SubscriptionPlanType;
  label: string;
  price: string;
  badge?: string;
  popular?: boolean;
}


const DashboardSkeleton = () => (
  <div className="space-y-6 max-w-3xl mx-auto">
    <GlassCard>
      <div className="flex items-start gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-2/5" />
        </div>
      </div>
    </GlassCard>
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, idx) => (
        <GlassCard key={idx}>
          <Skeleton className="h-24 w-full" />
        </GlassCard>
      ))}
    </div>
    <GlassCard>
      <Skeleton className="h-6 w-1/3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={idx} className="h-12 w-full" />
        ))}
      </div>
    </GlassCard>
  </div>
);

const defaultPlans: NormalizedPlan[] = [
  { type: "week", label: "1 неделя", price: "500 ₽" },
  { type: "month", label: "1 месяц", price: "1 000 ₽", popular: true, badge: "-20%" },
  { type: "year", label: "1 год", price: "5 700 ₽", badge: "-52%" },
];

function formatUsage(used: number, limit: LimitValue) {
  if (limit === "unlimited") {
    return `${used}`;
  }

  return `${used} / ${limit}`;
}

function formatRemaining(used: number, limit: LimitValue) {
  if (limit === "unlimited") {
    return "Без ограничений";
  }

  const remaining = Math.max(Number(limit) - used, 0);
  return `Осталось ${remaining}`;
}

export default function Dashboard() {
  const { logout } = useAuth();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [purchaseTarget, setPurchaseTarget] = useState<SubscriptionPlanType | null>(null);

  const dashboardQuery = useQuery<DashboardResponse>({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    staleTime: 60_000,
  });

  const plansQuery = useQuery<SubscriptionPlan[]>({
    queryKey: ["subscription", "plans"],
    queryFn: getSubscriptionPlans,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (dashboardQuery.isError) {
      const message = dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Попробуйте обновить позже";
      toast({ title: "Не удалось загрузить данные", description: message, variant: "destructive" });
    }
  }, [dashboardQuery.isError, dashboardQuery.error, toast]);

  const dashboard = dashboardQuery.data;
  const profile = dashboard?.user_profile;
  const subscription = dashboard?.subscription;
  const limits = dashboard?.limits;
  const stats = dashboard?.stats;
  const hasActiveSubscription = subscription?.status === "active";

  const normalizedPlans = useMemo<NormalizedPlan[]>(() => {
    if (!plansQuery.data || plansQuery.data.length === 0) {
      return defaultPlans;
    }

    return plansQuery.data
      .filter((plan) => plan.type !== "free")
      .map((plan) => ({
        type: plan.type,
        label: plan.name,
        price: new Intl.NumberFormat("ru-RU").format(plan.price) + ` ${plan.currency}`,
        popular: plan.type === "month",
      }));
  }, [plansQuery.data]);

  const statsCards = limits
    ? [
        {
          icon: BarChart3,
          label: "Парсинг",
          value: formatUsage(limits.parsing_used, limits.parsing_limit),
          trend: formatRemaining(limits.parsing_used, limits.parsing_limit),
        },
        {
          icon: Users,
          label: "Аудитория",
          value: formatUsage(limits.audience_used, limits.audience_limit),
          trend: formatRemaining(limits.audience_used, limits.audience_limit),
        },
        {
          icon: Send,
          label: "Рассылки",
          value: formatUsage(limits.broadcast_used, limits.broadcast_limit),
          trend: formatRemaining(limits.broadcast_used, limits.broadcast_limit),
        },
      ]
    : [];

  const recentActivity = stats?.recent_activity ?? [];

  const backgroundImage = profile?.photo_url ?? FALLBACK_BG;
  const displayName = profile?.name || profile?.username || "Пользователь";
  const username = profile?.username ?? profile?.phone ?? "—";
  const initialLetter = displayName.charAt(0).toUpperCase();
  const expiresAt = subscription?.expires_at
    ? new Date(subscription.expires_at).toLocaleDateString("ru-RU")
    : null;

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      toast({ title: "Вы вышли из аккаунта" });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handlePurchase = async (planType: SubscriptionPlanType) => {
    if (planType === "free") {
      toast({ title: "План уже активен" });
      return;
    }

    try {
      setPurchaseTarget(planType);
      const response = await purchaseSubscription(planType as Exclude<SubscriptionPlanType, "free">);
      window.open(response.robokassa_url, "_blank", "noopener,noreferrer");
      toast({ title: "Переход к Robokassa", description: "Оплата открыта в новой вкладке" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось оформить подписку";
      toast({ title: "Ошибка оплаты", description: message, variant: "destructive" });
    } finally {
      setPurchaseTarget(null);
    }
  };

  if (dashboardQuery.isLoading || !dashboard) {
    return (
      <AuthGuard>
        <Layout backgroundImage={FALLBACK_BG}>
          <DashboardSkeleton />
        </Layout>
      </AuthGuard>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <AuthGuard>
        <Layout backgroundImage={FALLBACK_BG}>
          <GlassCard>
            <div className="space-y-3 text-center">
              <p className="text-lg font-semibold">Не удалось загрузить данные</p>
              <p className="text-sm text-muted-foreground">Проверьте подключение и попробуйте ещё раз</p>
              <Button onClick={() => dashboardQuery.refetch()} variant="outline" className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Повторить попытку
              </Button>
            </div>
          </GlassCard>
        </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Layout backgroundImage={backgroundImage}>
        <div className="space-y-6 max-w-3xl mx-auto animate-slide-up">
          <GlassCard>
            <div className="flex items-start gap-4">
              <Avatar className="w-20 h-20 border-4 border-white/20">
                <AvatarImage src={profile?.photo_url ?? undefined} />
                <AvatarFallback>{initialLetter}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold leading-tight">{displayName}</h2>
                    <p className="text-muted-foreground text-sm">{username}</p>
                    {subscription && (
                      <Badge
                        className={`mt-2 ${hasActiveSubscription ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground"}`}
                      >
                        {hasActiveSubscription ? "Активная подписка" : "Нет подписки"}
                      </Badge>
                    )}
                    {hasActiveSubscription && expiresAt && (
                      <p className="text-xs text-muted-foreground mt-1">Действует до {expiresAt}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleLogout} disabled={isLoggingOut}>
                    {isLoggingOut ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </GlassCard>

          {!hasActiveSubscription && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold px-2 flex items-center gap-2">
                <Crown className="h-4 w-4 text-accent" /> Тарифы Robokassa
              </h3>
              <div className="grid gap-3 md:grid-cols-3">
                {normalizedPlans.map((plan) => (
                  <GlassCard
                    key={plan.type}
                    className={`space-y-3 border ${plan.popular ? "border-primary/60 shadow-lg" : "border-white/10"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{plan.label}</p>
                        {plan.badge && <Badge className="mt-1 bg-accent/20 text-accent">{plan.badge}</Badge>}
                      </div>
                      <p className="text-xl font-bold">{plan.price}</p>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => handlePurchase(plan.type)}
                      disabled={purchaseTarget === plan.type}
                    >
                      {purchaseTarget === plan.type ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Оформить"}
                    </Button>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {statsCards.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold px-2">Лимиты</h3>
              {statsCards.map((stat, idx) => (
                <div key={stat.label} style={{ animationDelay: `${idx * 80}ms` }} className="animate-fade-in">
                  <StatCard {...stat} />
                </div>
              ))}
            </div>
          )}

          {stats && (
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Статистика
                </h3>
                <Button variant="ghost" size="sm" className="gap-2" onClick={() => dashboardQuery.refetch()}>
                  <RefreshCw className="h-4 w-4" /> Обновить
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { label: "Найдено каналов", value: stats.total_channels_found },
                  { label: "Проанализировано аудитории", value: stats.total_audience_analyzed },
                  { label: "Отправлено сообщений", value: stats.total_broadcasts_sent },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl bg-white/5 p-4 text-center">
                    <p className="text-2xl font-bold">{item.value.toLocaleString("ru-RU")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Недавняя активность</h3>
              <span className="text-xs text-muted-foreground">Обновлено: {new Date().toLocaleTimeString("ru-RU")}</span>
            </div>
            {recentActivity.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">Пока нет активности</div>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 5).map((activity) => (
                  <div key={`${activity.type}-${activity.created_at}`} className="flex items-center justify-between rounded-xl bg-white/5 p-3">
                    <div>
                      <p className="font-medium">{activity.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Badge
                      className={
                        activity.status === "completed"
                          ? "bg-emerald-500/20 text-emerald-500"
                          : activity.status === "failed"
                            ? "bg-destructive/20 text-destructive"
                            : "bg-amber-500/20 text-amber-500"
                      }
                    >
                      {activity.status === "in_progress" ? "В процессе" : activity.status === "completed" ? "Готово" : "Ошибка"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </Layout>
    </AuthGuard>
  );
}
