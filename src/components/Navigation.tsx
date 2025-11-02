import { Home, Search, Users, Send, BookOpen } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const navItems = [
  { icon: Home, label: "Кабинет", path: "/" },
  { icon: Search, label: "Парсинг", path: "/parsing" },
  { icon: Users, label: "Аудитория", path: "/audience" },
  { icon: Send, label: "Рассылка", path: "/broadcast" },
  { icon: BookOpen, label: "Помощь", path: "/help" },
];

export const Navigation = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      <div className="glass-card glass-effect rounded-t-3xl border-t mx-4 mb-4">
        <div className="flex justify-around items-center px-2 py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all duration-300 ${
                  isActive 
                    ? "bg-primary/20 text-primary glow-effect" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform ${isActive ? "scale-110" : ""}`} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
