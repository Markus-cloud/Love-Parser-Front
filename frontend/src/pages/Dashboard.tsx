import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, Send, CheckCircle, Crown } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  // Mock user data - will be replaced with Telegram WebApp API
  const [user] = useState({
    id: "123456789",
    firstName: "Александр",
    username: "@username",
    photoUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=telegram",
    hasSubscription: false,
  });

  const stats = [
    { icon: BarChart3, label: "Парсингов", value: "0", trend: "+0 за неделю" },
    { icon: Users, label: "Контактов", value: "0", trend: "Начните парсинг" },
    { icon: Send, label: "Рассылок", value: "0", trend: "Ожидает запуска" },
  ];

  const pricingPlans = [
    { period: "1 неделя", price: "500 ₽", discount: null },
    { period: "1 месяц", price: "1000 ₽", discount: "-20%", popular: true },
    { period: "1 год", price: "5700 ₽", discount: "-52%", savings: "Экономия 5500 ₽" },
  ];

  return (
    <Layout backgroundImage={user.photoUrl}>
      <div className="space-y-6 max-w-2xl mx-auto animate-slide-up">
        {/* User Profile Card */}
        <GlassCard>
          <div className="flex items-start gap-4 mb-4">
            <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-white/30 flex-shrink-0">
              <AvatarImage src={user.photoUrl} />
              <AvatarFallback>{user.firstName[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold">{user.firstName}</h2>
              <p className="text-muted-foreground text-sm">{user.username}</p>
              <p className="text-xs text-muted-foreground mt-1">ID: {user.id}</p>
              {user.hasSubscription ? (
                <Badge className="bg-accent/20 text-accent border-accent/30 text-xs whitespace-nowrap mt-2 inline-flex">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Активна
                </Badge>
              ) : (
                <Badge variant="outline" className="border-muted text-xs whitespace-nowrap mt-2 inline-flex">
                  Нет подписки
                </Badge>
              )}
            </div>
          </div>

          {!user.hasSubscription && (
            <div className="pt-4 border-t border-white/20">
              <p className="text-sm text-muted-foreground mb-3">
                Оформите подписку для доступа ко всем функциям
              </p>
              <Button className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 glow-effect">
                <Crown className="w-4 h-4 mr-2" />
                Оформить подписку
              </Button>
            </div>
          )}
        </GlassCard>

        {/* Subscription Plans */}
        {!user.hasSubscription && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold px-2">Выберите тариф</h3>
            {pricingPlans.map((plan, idx) => (
              <GlassCard key={idx} hover className={plan.popular ? "border-primary/50 ring-2 ring-primary/20" : ""}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{plan.period}</h4>
                      {plan.discount && (
                        <Badge className="bg-accent/20 text-accent border-accent/30 text-xs">
                          {plan.discount}
                        </Badge>
                      )}
                      {plan.popular && (
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                          Популярно
                        </Badge>
                      )}
                    </div>
                    {plan.savings && (
                      <p className="text-xs text-muted-foreground mt-1">{plan.savings}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold gradient-text">{plan.price}</p>
                    <Button 
                      size="sm" 
                      className={plan.popular ? "bg-primary glow-effect" : "bg-secondary"}
                    >
                      Выбрать
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Statistics */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold px-2">Статистика</h3>
          {stats.map((stat, idx) => (
            <div key={idx} style={{ animationDelay: `${idx * 100}ms` }} className="animate-fade-in">
              <StatCard {...stat} />
            </div>
          ))}
        </div>

        {/* Activity Chart Placeholder */}
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4">Активность за месяц</h3>
          <div className="h-48 flex items-end justify-around gap-2">
            {[40, 65, 45, 80, 55, 90, 70].map((height, idx) => (
              <div 
                key={idx}
                className="flex-1 bg-gradient-to-t from-primary to-accent rounded-t-lg opacity-60 hover:opacity-100 transition-all duration-300"
                style={{ 
                  height: `${height}%`,
                  animationDelay: `${idx * 100}ms`
                }}
              />
            ))}
          </div>
          <div className="flex justify-around text-xs text-muted-foreground mt-2">
            <span>ПН</span>
            <span>ВТ</span>
            <span>СР</span>
            <span>ЧТ</span>
            <span>ПТ</span>
            <span>СБ</span>
            <span>ВС</span>
          </div>
        </GlassCard>
      </div>
    </Layout>
  );
}
