import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { BookOpen, Home, Search, Users, Send } from "lucide-react";

export default function Help() {
  const sections = [
    {
      icon: Home,
      title: "Личный кабинет",
      content: "В личном кабинете вы можете просмотреть информацию о вашей подписке, статистику использования и оформить подписку. Доступны тарифы на неделю, месяц и год со скидками.",
    },
    {
      icon: Search,
      title: "Парсинг каналов",
      content: "Найдите нужные Telegram каналы по городу, категории и количеству участников. Результаты сохраняются в Excel файлы, которые можно скачать по отдельности или архивом.",
    },
    {
      icon: Users,
      title: "Активная аудитория",
      content: "Анализируйте активность пользователей в каналах и чатах. Система находит людей с наибольшей вовлечённостью по лайкам, комментариям и репостам за выбранный период.",
    },
    {
      icon: Send,
      title: "Рассылка",
      content: "Отправляйте сообщения собранной аудитории. Система автоматически контролирует скорость отправки, чтобы избежать блокировки. Вы можете отслеживать прогресс в реальном времени.",
    },
  ];

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl mx-auto animate-slide-up">
        <GlassCard>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-accent/20 glow-effect">
              <BookOpen className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Инструкция</h1>
              <p className="text-sm text-muted-foreground">Как пользоваться приложением</p>
            </div>
          </div>
        </GlassCard>

        {sections.map((section, idx) => {
          const Icon = section.icon;
          return (
            <div 
              key={idx}
              className="animate-fade-in"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <GlassCard>
              <div className="flex gap-4">
                <div className="p-3 rounded-2xl bg-primary/20 h-fit">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">{section.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {section.content}
                  </p>
                </div>
              </div>
              </GlassCard>
            </div>
          );
        })}

        <GlassCard className="bg-primary/5 border-primary/20">
          <h3 className="font-semibold mb-3">Важная информация</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Все данные хранятся только во время активной подписки</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>При завершении подписки файлы и статистика удаляются автоматически</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Рассылки работают с учётом лимитов Telegram для безопасности</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Авторизация происходит автоматически через Telegram</span>
            </li>
          </ul>
        </GlassCard>

        <GlassCard className="text-center">
          <p className="text-sm text-muted-foreground">
            Если у вас остались вопросы, свяжитесь с поддержкой
          </p>
          <a 
            href="https://t.me/support" 
            className="text-primary font-medium text-sm mt-2 inline-block hover:underline"
          >
            @support
          </a>
        </GlassCard>
      </div>
    </Layout>
  );
}
