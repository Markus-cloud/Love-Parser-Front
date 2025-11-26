export interface ParseSearchJob {
  requestId: string;
  query: string;
  depth?: number;
  initiatedBy?: string;
  metadata?: Record<string, unknown>;
}
