import { useCallback, useState } from "react";

import { useToast } from "@/hooks/use-toast";

interface DownloadOptions {
  fileName?: string;
  getFile: () => Promise<Blob | string>;
}

interface UseCSVExportOptions {
  defaultFileName?: string;
}

export function useCSVExport(options?: UseCSVExportOptions) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(
    async ({ fileName, getFile }: DownloadOptions) => {
      if (typeof window === "undefined") {
        return;
      }

      setIsDownloading(true);
      try {
        const payload = await getFile();
        const blob = payload instanceof Blob ? payload : new Blob([payload], { type: "text/csv;charset=utf-8" });

        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName ?? options?.defaultFileName ?? `export-${Date.now()}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(objectUrl);

        toast({ title: "Экспорт подготовлен", description: "Загрузка CSV файла началась" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось скачать файл";
        toast({ title: "Ошибка экспорта", description: message, variant: "destructive" });
        throw error;
      } finally {
        setIsDownloading(false);
      }
    },
    [options?.defaultFileName, toast],
  );

  return {
    download,
    isDownloading,
  };
}
