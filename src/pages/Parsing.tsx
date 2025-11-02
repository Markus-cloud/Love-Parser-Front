import { Layout } from "@/components/Layout";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Parsing() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [files] = useState([
    { name: "telegram_channels_moscow_tech.xlsx", date: "01.11.2024", count: 1247 },
    { name: "telegram_channels_spb_business.xlsx", date: "28.10.2024", count: 892 },
  ]);

  const handleParsing = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Парсинг завершён",
        description: "Результаты сохранены в Excel файл",
      });
    }, 3000);
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl mx-auto animate-slide-up">
        <GlassCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-primary/20 glow-effect">
              <Search className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Поиск каналов</h1>
              <p className="text-sm text-muted-foreground">Найдите нужные Telegram каналы</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Город</Label>
              <Select>
                <SelectTrigger className="glass-card border-white/20 mt-1">
                  <SelectValue placeholder="Выберите город" />
                </SelectTrigger>
                <SelectContent className="glass-card glass-effect">
                  <SelectItem value="moscow">Москва</SelectItem>
                  <SelectItem value="spb">Санкт-Петербург</SelectItem>
                  <SelectItem value="ekb">Екатеринбург</SelectItem>
                  <SelectItem value="nsk">Новосибирск</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Категория</Label>
              <Select>
                <SelectTrigger className="glass-card border-white/20 mt-1">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent className="glass-card glass-effect">
                  <SelectItem value="tech">Технологии</SelectItem>
                  <SelectItem value="business">Бизнес</SelectItem>
                  <SelectItem value="crypto">Криптовалюты</SelectItem>
                  <SelectItem value="edu">Образование</SelectItem>
                  <SelectItem value="sport">Спорт</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>От (участников)</Label>
                <Input 
                  type="number" 
                  placeholder="1000" 
                  className="glass-card border-white/20 mt-1"
                />
              </div>
              <div>
                <Label>До (участников)</Label>
                <Input 
                  type="number" 
                  placeholder="100000" 
                  className="glass-card border-white/20 mt-1"
                />
              </div>
            </div>

            <Button 
              onClick={handleParsing}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 glow-effect mt-6"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Парсинг...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Начать парсинг
                </>
              )}
            </Button>
          </div>
        </GlassCard>

        {/* Results Files */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-lg font-semibold">Результаты</h3>
            {files.length > 0 && (
              <Button size="sm" variant="outline" className="glass-card border-white/20">
                <Download className="w-4 h-4 mr-2" />
                Скачать все
              </Button>
            )}
          </div>
          
          {files.length === 0 ? (
            <GlassCard>
              <div className="text-center py-8">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">Нет сохранённых результатов</p>
                <p className="text-sm text-muted-foreground mt-1">Начните парсинг для получения данных</p>
              </div>
            </GlassCard>
          ) : (
            files.map((file, idx) => (
              <GlassCard key={idx} hover>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent/20">
                      <FileSpreadsheet className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.count} контактов • {file.date}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </GlassCard>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
