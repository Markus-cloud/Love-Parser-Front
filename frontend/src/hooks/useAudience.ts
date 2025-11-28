import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAudienceSegment,
  getAudienceSegmentPreview,
  getAudienceSegments,
  type CreateAudienceSegmentPayload,
} from "@/api/audience.service";
import { getParsingHistory } from "@/api/parsing.service";
import type { AudiencePreviewResponse, AudienceSegmentSummary } from "@/types/audience";
import type { ParsingHistoryItem } from "@/types/parsing";
import { useToast } from "@/hooks/use-toast";

const SEGMENTS_QUERY_KEY = ["audience", "segments"] as const;
const PARSING_SOURCES_QUERY_KEY = ["audience", "parsingSources"] as const;

export function useAudience() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const segmentsQuery = useQuery({
    queryKey: SEGMENTS_QUERY_KEY,
    queryFn: () => getAudienceSegments({ limit: 20 }),
  });

  useEffect(() => {
    if (!selectedSegmentId && segmentsQuery.data && segmentsQuery.data.length > 0) {
      setSelectedSegmentId(segmentsQuery.data[0].id);
    }
  }, [segmentsQuery.data, selectedSegmentId]);

  const previewQuery = useQuery({
    queryKey: ["audience", "preview", selectedSegmentId],
    queryFn: () => (selectedSegmentId ? getAudienceSegmentPreview(selectedSegmentId, 15) : null),
    enabled: Boolean(selectedSegmentId),
  });

  const parsingSourcesQuery = useQuery({
    queryKey: PARSING_SOURCES_QUERY_KEY,
    queryFn: () => getParsingHistory({ limit: 50 }),
  });

  const createSegment = useMutation({
    mutationFn: (payload: CreateAudienceSegmentPayload) => createAudienceSegment(payload),
    onSuccess: (segment) => {
      toast({ title: "Сегмент создан", description: "Мы начали расчёт аудитории" });
      setSelectedSegmentId(segment.id);
      void queryClient.invalidateQueries({ queryKey: SEGMENTS_QUERY_KEY });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Не удалось создать сегмент";
      toast({ title: "Ошибка создания", description: message, variant: "destructive" });
    },
  });

  const segments = useMemo<AudienceSegmentSummary[]>(() => segmentsQuery.data ?? [], [segmentsQuery.data]);
  const parsingSources = useMemo<ParsingHistoryItem[]>(() => parsingSourcesQuery.data ?? [], [parsingSourcesQuery.data]);
  const preview = useMemo<AudiencePreviewResponse | null>(() => previewQuery.data ?? null, [previewQuery.data]);

  return {
    segments,
    segmentsStatus: segmentsQuery.status,
    segmentsError: segmentsQuery.error,
    refreshSegments: segmentsQuery.refetch,
    parsingSources,
    parsingSourcesStatus: parsingSourcesQuery.status,
    parsingSourcesError: parsingSourcesQuery.error,
    refreshParsingSources: parsingSourcesQuery.refetch,
    selectedSegmentId,
    selectSegment: setSelectedSegmentId,
    preview,
    previewStatus: previewQuery.status,
    previewError: previewQuery.error,
    refreshPreview: previewQuery.refetch,
    createSegment,
  } as const;
}
