import { JobTypes } from "@/jobs/jobTypes";
import { addJob } from "@/utils/queueHelpers";
import { pgPool } from "@/utils/clients";
import { AuthError, NotFoundError, ValidationError } from "@/utils/errors";
import { logger } from "@/utils/logger";
import {
  BroadcastCampaign,
  BroadcastDelayConfig,
  BroadcastHistoryEntry,
  BroadcastLogEntry,
  BroadcastLogStatus,
  BroadcastMessage,
  BroadcastProgressSnapshot,
  BroadcastStatus,
} from "@/types/broadcast";
import { NormalizedAudienceSegmentFilters } from "@/types/audience";
import {
  assertBroadcastCampaignQuotaAvailable,
  assertBroadcastMessageQuotaAvailable,
  incrementBroadcastCampaignUsage,
  incrementBroadcastMessageUsage,
} from "@/services/broadcast/usage.service";
import { readBroadcastProgress, saveBroadcastProgress } from "@/services/broadcast/progress.service";

interface BroadcastCampaignRow {
  id: string;
  user_id: string;
  segment_id: string | null;
  target_type: string | null;
  manual_recipients: unknown;
  message: unknown;
  delay_config: unknown;
  total_recipients: number | null;
  sent_count: number | null;
  failed_count: number | null;
  blocked_count: number | null;
  status: string | null;
  job_id: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  title: string | null;
  content: string | null;
  last_error: string | null;
}

interface AudienceSegmentRow {
  id: string;
  user_id: string;
  name: string | null;
  filters: unknown;
  total_recipients: number | null;
  source_parsing_id: string | null;
}

interface BroadcastLogRow {
  id: string;
  campaign_id: string;
  user_id: string | null;
  recipient_username: string | null;
  recipient_id: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  sent_at: Date;
}

interface FailedRecipientRow {
  recipient_username: string | null;
}

export interface CampaignRuntimeContext extends BroadcastCampaign {
  audienceName: string;
  sourceParsingId?: string | null;
  segmentFilters?: NormalizedAudienceSegmentFilters | null;
}

export interface CreateCampaignInput {
  userId: string;
  audienceSegmentId?: string;
  manualRecipients?: string[];
  message: BroadcastMessage;
  delay?: Partial<BroadcastDelayConfig>;
}

export interface CampaignCreationResult {
  campaignId: string;
  totalRecipients: number;
  status: BroadcastStatus;
}

export interface StartCampaignResult {
  campaignId: string;
  status: BroadcastStatus;
  sent: number;
  total: number;
}

export interface RetryCampaignInput {
  userId: string;
  campaignId: string;
  retryOnlyFailed?: boolean;
}

export interface RetryCampaignResult {
  campaignId: string;
  status: BroadcastStatus;
  newTotal: number;
}

export interface LogsQuery {
  page: number;
  limit: number;
  status?: BroadcastLogStatus;
}

export interface HistoryQuery {
  page: number;
  limit: number;
  status?: BroadcastStatus;
}

const DEFAULT_DELAY: BroadcastDelayConfig = { min_ms: 3_000, max_ms: 7_000 };
const MAX_MANUAL_RECIPIENTS = 10_000;
const MAX_SEGMENT_RECIPIENTS = 50_000;
const RECIPIENT_REGEX = /^@?[a-zA-Z0-9_]{4,32}$/;
const TERMINAL_STATUSES = new Set<BroadcastStatus>(["completed", "failed"]);

function normalizeDelayConfig(delay?: Partial<BroadcastDelayConfig>): BroadcastDelayConfig {
  const minMs = Number(delay?.min_ms ?? DEFAULT_DELAY.min_ms);
  const maxMs = Number(delay?.max_ms ?? DEFAULT_DELAY.max_ms);
  const safeMin = Number.isFinite(minMs) ? Math.max(200, Math.floor(minMs)) : DEFAULT_DELAY.min_ms;
  const safeMax = Number.isFinite(maxMs) ? Math.max(safeMin, Math.floor(maxMs)) : Math.max(safeMin, DEFAULT_DELAY.max_ms);
  return {
    min_ms: safeMin,
    max_ms: safeMax,
  };
}

function normalizeMessage(message: BroadcastMessage): BroadcastMessage {
  const text = message.text?.trim();
  if (!text) {
    throw new ValidationError("Message text is required");
  }

  const payload: BroadcastMessage = { text };
  if (message.image && message.image.trim().length > 0) {
    payload.image = message.image.trim();
  }

  return payload;
}

export function parseManualRecipients(raw?: string[]): string[] {
  if (!raw || raw.length === 0) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    const withPrefix = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
    if (!RECIPIENT_REGEX.test(withPrefix)) {
      continue;
    }

    const lowered = withPrefix.toLowerCase();
    if (seen.has(lowered)) {
      continue;
    }

    seen.add(lowered);
    normalized.push(withPrefix);
  }

  return normalized.slice(0, MAX_MANUAL_RECIPIENTS);
}

function parseManualRecipientsColumn(value: unknown): string[] {
  if (Array.isArray(value)) {
    return parseManualRecipients(value.map((entry) => (typeof entry === "string" ? entry : "")));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parseManualRecipients(parsed.map((entry) => (typeof entry === "string" ? entry : "")));
      }
    } catch (error) {
      logger.warn("Failed to parse manual recipients column", { error });
    }
  }

  return [];
}

function parseMessageColumn(value: unknown): BroadcastMessage {
  if (!value) {
    return { text: "" };
  }

  if (typeof value === "object") {
    const maybe = value as BroadcastMessage;
    if (typeof maybe.text === "string") {
      return normalizeMessage(maybe);
    }
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed && typeof parsed.text === "string") {
        return normalizeMessage(parsed as BroadcastMessage);
      }
    } catch (error) {
      logger.warn("Failed to parse message column", { error });
    }
  }

  return { text: "" };
}

function parseDelayColumn(value: unknown): BroadcastDelayConfig {
  if (!value) {
    return DEFAULT_DELAY;
  }

  if (typeof value === "object") {
    const maybe = value as Partial<BroadcastMessageDelay>;
    if (typeof maybe.min_ms === "number" || typeof maybe.max_ms === "number") {
      return normalizeDelayConfig(maybe);
    }
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed) {
        return normalizeDelayConfig(parsed as Partial<BroadcastMessageDelay>);
      }
    } catch (error) {
      logger.warn("Failed to parse delay config column", { error });
    }
  }

  return DEFAULT_DELAY;
}

function mapCampaignRow(row: BroadcastCampaignRow): BroadcastCampaign {
  return {
    id: row.id,
    userId: row.user_id,
    segmentId: row.segment_id,
    targetType: row.target_type === "segment" ? "segment" : "manual",
    manualRecipients: parseManualRecipientsColumn(row.manual_recipients),
    message: parseMessageColumn(row.message),
    delay: parseDelayColumn(row.delay_config),
    totalRecipients: Number(row.total_recipients ?? 0),
    sentCount: Number(row.sent_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    blockedCount: Number(row.blocked_count ?? 0),
    status: (row.status ?? "draft") as BroadcastStatus,
    jobId: row.job_id ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  } satisfies BroadcastCampaign;
}

function parseSegmentFilters(value: unknown): NormalizedAudienceSegmentFilters | null {
  if (!value) {
    return null;
  }

  let raw: Record<string, unknown> | null = null;

  if (typeof value === "object") {
    raw = value as Record<string, unknown>;
  } else if (typeof value === "string") {
    try {
      raw = JSON.parse(value) as Record<string, unknown>;
    } catch (error) {
      logger.warn("Failed to parse segment filters", { error });
      raw = null;
    }
  }

  if (!raw) {
    return null;
  }

  const filters: NormalizedAudienceSegmentFilters = {};

  if (typeof raw.language === "string" && raw.language.trim().length > 0) {
    filters.language = raw.language.trim().toLowerCase();
  }

  const minSubscribers = (raw.minSubscribers ?? raw.min_subscribers) as number | undefined;
  if (typeof minSubscribers === "number" && Number.isFinite(minSubscribers)) {
    filters.minSubscribers = minSubscribers;
  }

  const maxSubscribers = (raw.maxSubscribers ?? raw.max_subscribers) as number | undefined;
  if (typeof maxSubscribers === "number" && Number.isFinite(maxSubscribers)) {
    filters.maxSubscribers = maxSubscribers;
  }

  const engagementMin = (raw.engagementMin ?? raw.engagement_min) as number | undefined;
  if (typeof engagementMin === "number" && Number.isFinite(engagementMin)) {
    filters.engagementMin = engagementMin;
  }

  const engagementMax = (raw.engagementMax ?? raw.engagement_max) as number | undefined;
  if (typeof engagementMax === "number" && Number.isFinite(engagementMax)) {
    filters.engagementMax = engagementMax;
  }

  const activityLevel = (raw.activityLevel ?? raw.activity_level) as NormalizedAudienceSegmentFilters["postFrequency"];
  if (activityLevel === "low" || activityLevel === "medium" || activityLevel === "high") {
    filters.activityLevel = activityLevel;
  }

  return Object.keys(filters).length > 0 ? filters : null;
}

function buildFilterClauses(filters: NormalizedAudienceSegmentFilters | null | undefined, values: unknown[]): string[] {
  if (!filters) {
    return [];
  }

  const clauses: string[] = [];

  if (typeof filters.engagementMin === "number") {
    values.push(filters.engagementMin);
    clauses.push(`COALESCE((pc.metadata->>'activityScore')::numeric, 0) >= $${values.length}`);
  }

  if (typeof filters.engagementMax === "number") {
    values.push(filters.engagementMax);
    clauses.push(`COALESCE((pc.metadata->>'activityScore')::numeric, 0) <= $${values.length}`);
  }

  if (typeof filters.minSubscribers === "number") {
    values.push(filters.minSubscribers);
    clauses.push(`pc.member_count >= $${values.length}`);
  }

  if (typeof filters.maxSubscribers === "number") {
    values.push(filters.maxSubscribers);
    clauses.push(`pc.member_count <= $${values.length}`);
  }

  if (filters.language) {
    values.push(filters.language);
    clauses.push(`LOWER(COALESCE(pc.metadata->>'language', '')) = LOWER($${values.length})`);
  }

  if (filters.activityLevel) {
    values.push(filters.activityLevel);
    clauses.push(`LOWER(COALESCE(pc.metadata->>'activityLevel', '')) = LOWER($${values.length})`);
  }

  return clauses;
}

function buildCampaignTitle(messageText: string, targetType: string, totalRecipients: number, audienceName?: string | null) {
  if (targetType === "segment" && audienceName) {
    return `${audienceName} (${totalRecipients})`;
  }

  const normalized = messageText.trim();
  if (!normalized) {
    return targetType === "segment" ? "Segment broadcast" : `Manual broadcast (${totalRecipients})`;
  }

  return normalized.slice(0, 120);
}

async function fetchAudienceSegment(userId: string, segmentId: string): Promise<AudienceSegmentRow> {
  const result = await pgPool.query<AudienceSegmentRow>(
    `SELECT id, user_id, name, filters, total_recipients, source_parsing_id
     FROM audience_segments
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [segmentId, userId],
  );

  if (result.rowCount === 0) {
    throw new NotFoundError("Audience segment not found");
  }

  return result.rows[0];
}

async function getCampaignRow(userId: string, campaignId: string): Promise<BroadcastCampaignRow> {
  const result = await pgPool.query<BroadcastCampaignRow>(
    `SELECT *
     FROM broadcast_campaigns
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [campaignId, userId],
  );

  if (result.rowCount === 0) {
    throw new NotFoundError("Broadcast campaign not found");
  }

  return result.rows[0];
}

async function getCampaignRowById(campaignId: string): Promise<BroadcastCampaignRow> {
  const result = await pgPool.query<BroadcastCampaignRow>(
    `SELECT *
     FROM broadcast_campaigns
     WHERE id = $1
     LIMIT 1`,
    [campaignId],
  );

  if (result.rowCount === 0) {
    throw new NotFoundError("Broadcast campaign not found");
  }

  return result.rows[0];
}

function buildProgressFromCampaign(campaign: BroadcastCampaign): BroadcastProgressSnapshot {
  const processed = campaign.sentCount + campaign.failedCount + campaign.blockedCount;
  const total = Math.max(campaign.totalRecipients, processed);
  const progress = total === 0 ? 0 : Math.round((processed / total) * 100);
  const eta_seconds = total > processed ? Math.round(((total - processed) * (campaign.delay.min_ms + campaign.delay.max_ms)) / 2 / 1000) : 0;

  return {
    campaignId: campaign.id,
    status: campaign.status,
    sent: campaign.sentCount,
    failed: campaign.failedCount,
    blocked: campaign.blockedCount,
    total,
    progress,
    eta_seconds,
    last_error: null,
    updated_at: new Date().toISOString(),
  } satisfies BroadcastProgressSnapshot;
}

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignCreationResult> {
  if (!input.userId) {
    throw new AuthError("Authentication required");
  }

  const hasSegment = Boolean(input.audienceSegmentId);
  const hasManual = Array.isArray(input.manualRecipients) && input.manualRecipients.length > 0;

  if ((hasSegment && hasManual) || (!hasSegment && !hasManual)) {
    throw new ValidationError("Provide either audience_segment_id or manual_recipients");
  }

  await assertBroadcastCampaignQuotaAvailable(input.userId);

  const message = normalizeMessage(input.message);
  const delay = normalizeDelayConfig(input.delay);

  let targetType: "segment" | "manual" = "manual";
  let manualRecipients: string[] = [];
  let segmentId: string | null = null;
  let totalRecipients = 0;
  let audienceName: string | null = null;

  if (hasSegment) {
    targetType = "segment";
    segmentId = input.audienceSegmentId ?? null;
    const segment = await fetchAudienceSegment(input.userId, segmentId!);
    totalRecipients = Number(segment.total_recipients ?? 0);
    audienceName = segment.name;

    if (!segment.source_parsing_id) {
      throw new ValidationError("Audience segment has no associated parsing results");
    }

    if (totalRecipients <= 0) {
      throw new ValidationError("Audience segment has no recipients");
    }
  } else {
    manualRecipients = parseManualRecipients(input.manualRecipients);
    if (manualRecipients.length === 0) {
      throw new ValidationError("Manual recipients list is empty");
    }

    if (manualRecipients.length > MAX_MANUAL_RECIPIENTS) {
      manualRecipients = manualRecipients.slice(0, MAX_MANUAL_RECIPIENTS);
    }

    totalRecipients = manualRecipients.length;
  }

  const title = buildCampaignTitle(message.text, targetType, totalRecipients, audienceName);

  const result = await pgPool.query<BroadcastCampaignRow>(
    `INSERT INTO broadcast_campaigns (
       user_id,
       segment_id,
       target_type,
       manual_recipients,
       message,
       delay_config,
       total_recipients,
       sent_count,
       failed_count,
       blocked_count,
       status,
       title,
       content
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, 0, 0, 0, 'draft', $8, $9
     )
     RETURNING *`,
    [
      input.userId,
      segmentId,
      targetType,
      JSON.stringify(manualRecipients),
      JSON.stringify(message),
      JSON.stringify(delay),
      totalRecipients,
      title,
      message.text,
    ],
  );

  await incrementBroadcastCampaignUsage(input.userId, 1);
  const campaign = mapCampaignRow(result.rows[0]);

  return {
    campaignId: campaign.id,
    totalRecipients: campaign.totalRecipients,
    status: campaign.status,
  };
}

export async function startCampaign(userId: string, campaignId: string): Promise<StartCampaignResult> {
  const row = await getCampaignRow(userId, campaignId);
  const campaign = mapCampaignRow(row);

  if (campaign.status !== "draft") {
    throw new ValidationError("Campaign is not in draft state");
  }

  if (campaign.totalRecipients <= 0) {
    throw new ValidationError("Campaign has no recipients");
  }

  await assertBroadcastMessageQuotaAvailable(userId, campaign.totalRecipients);

  const job = await addJob(JobTypes.BROADCAST, {
    campaignId,
    userId,
    retryOnlyFailed: false,
  });

  await pgPool.query(
    `UPDATE broadcast_campaigns
     SET status = 'in_progress', job_id = $3, started_at = NOW(), sent_count = 0, failed_count = 0, blocked_count = 0, last_error = NULL
     WHERE id = $1 AND user_id = $2`,
    [campaignId, userId, job.id?.toString() ?? null],
  );

  await saveBroadcastProgress(campaignId, {
    campaignId,
    status: "in_progress",
    sent: 0,
    failed: 0,
    blocked: 0,
    total: campaign.totalRecipients,
    progress: 0,
    eta_seconds: Math.round(((campaign.delay.min_ms + campaign.delay.max_ms) / 2 / 1000) * campaign.totalRecipients),
  });

  return {
    campaignId,
    status: "in_progress",
    sent: 0,
    total: campaign.totalRecipients,
  };
}

export async function getCampaignProgress(userId: string, campaignId: string): Promise<BroadcastProgressSnapshot> {
  await getCampaignRow(userId, campaignId);

  const cached = await readBroadcastProgress(campaignId);
  if (cached) {
    return cached;
  }

  const campaign = mapCampaignRow(await getCampaignRowById(campaignId));
  return buildProgressFromCampaign(campaign);
}

export async function getCampaignLogs(userId: string, campaignId: string, query: LogsQuery) {
  await getCampaignRow(userId, campaignId);

  const page = Math.max(1, query.page);
  const limit = Math.min(Math.max(1, query.limit), 200);
  const offset = (page - 1) * limit;

  const values: unknown[] = [campaignId];
  const clauses: string[] = [];

  if (query.status) {
    values.push(query.status);
    clauses.push(`status = $${values.length}`);
  }

  const result = await pgPool.query<BroadcastLogRow>(
    `SELECT id, campaign_id, user_id, recipient_username, recipient_id, status, error_code, error_message, sent_at
     FROM broadcast_logs
     WHERE campaign_id = $1 ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
     ORDER BY sent_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );

  const logs: BroadcastLogEntry[] = result.rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    recipientUsername: row.recipient_username ?? row.recipient_id ?? "",
    recipientId: row.recipient_id,
    status: (row.status ?? "failed") as BroadcastLogStatus,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    sentAt: row.sent_at.toISOString(),
  }));

  return { logs };
}

export async function getCampaignHistory(userId: string, query: HistoryQuery): Promise<BroadcastHistoryEntry[]> {
  const page = Math.max(1, query.page);
  const limit = Math.min(Math.max(1, query.limit), 100);
  const offset = (page - 1) * limit;

  const values: unknown[] = [userId];
  let clause = "WHERE bc.user_id = $1";

  if (query.status) {
    values.push(query.status);
    clause += " AND bc.status = $" + values.length;
  }

  const limitPlaceholder = "$" + (values.length + 1);
  const offsetPlaceholder = "$" + (values.length + 2);

  const result = await pgPool.query(
    `SELECT bc.*, asg.name AS audience_name
     FROM broadcast_campaigns bc
     LEFT JOIN audience_segments asg ON asg.id = bc.segment_id
     ${clause}
     ORDER BY bc.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    [...values, limit, offset],
  );

  return result.rows.map((row: BroadcastCampaignRow & { audience_name: string | null }) => {
    const campaign = mapCampaignRow(row);
    const fallbackName = campaign.targetType === "segment" ? "Audience segment" : `Manual list (${campaign.totalRecipients})`;
    const resolvedAudienceName = row.audience_name && row.audience_name.trim().length > 0 ? row.audience_name : fallbackName;

    return {
      id: campaign.id,
      audienceName: resolvedAudienceName,
      totalRecipients: campaign.totalRecipients,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      blockedCount: campaign.blockedCount,
      status: campaign.status,
      createdAt: campaign.createdAt,
    } satisfies BroadcastHistoryEntry;
  });
}

export async function getFailedRecipientUsernames(campaignId: string): Promise<string[]> {
  const result = await pgPool.query<FailedRecipientRow>(
    `SELECT recipient_username
     FROM broadcast_logs
     WHERE campaign_id = $1 AND status IN ('failed', 'blocked')
     ORDER BY sent_at ASC`,
    [campaignId],
  );

  const usernames = result.rows
    .map((row) => row.recipient_username ?? "")
    .filter((value): value is string => Boolean(value && RECIPIENT_REGEX.test(value)));

  return parseManualRecipients(usernames);
}

export async function retryCampaign(input: RetryCampaignInput): Promise<RetryCampaignResult> {
  const row = await getCampaignRow(input.userId, input.campaignId);
  const campaign = mapCampaignRow(row);

  if (campaign.status === "in_progress") {
    throw new ValidationError("Campaign is already running");
  }

  let targetTotal = campaign.totalRecipients;
  let retryOnlyFailed = Boolean(input.retryOnlyFailed);

  if (retryOnlyFailed) {
    const failedRecipients = await getFailedRecipientUsernames(campaign.id);
    if (failedRecipients.length === 0) {
      throw new ValidationError("No failed recipients to retry");
    }
    targetTotal = failedRecipients.length;
  } else {
    if (campaign.targetType === "manual") {
      targetTotal = campaign.manualRecipients.length;
    } else {
      targetTotal = Math.max(campaign.totalRecipients, 0);
    }
  }

  if (targetTotal <= 0) {
    throw new ValidationError("Campaign has no recipients to retry");
  }

  await assertBroadcastMessageQuotaAvailable(input.userId, targetTotal);

  const job = await addJob(JobTypes.BROADCAST, {
    campaignId: campaign.id,
    userId: campaign.userId,
    retryOnlyFailed,
  });

  await pgPool.query(
    `UPDATE broadcast_campaigns
     SET status = 'in_progress',
         job_id = $3,
         started_at = NOW(),
         completed_at = NULL,
         sent_count = 0,
         failed_count = 0,
         blocked_count = 0,
         total_recipients = $4,
         last_error = NULL
     WHERE id = $1 AND user_id = $2`,
    [campaign.id, input.userId, job.id?.toString() ?? null, targetTotal],
  );

  await saveBroadcastProgress(campaign.id, {
    campaignId: campaign.id,
    status: "in_progress",
    sent: 0,
    failed: 0,
    blocked: 0,
    total: targetTotal,
    progress: 0,
    eta_seconds: Math.round(((campaign.delay.min_ms + campaign.delay.max_ms) / 2 / 1000) * targetTotal),
  });

  return {
    campaignId: campaign.id,
    status: "in_progress",
    newTotal: targetTotal,
  };
}

export async function getCampaignRuntimeContext(campaignId: string): Promise<CampaignRuntimeContext> {
  const result = await pgPool.query<BroadcastCampaignRow & { audience_name: string | null; filters: unknown; source_parsing_id: string | null }>(
    `SELECT bc.*, asg.name AS audience_name, asg.filters, asg.source_parsing_id
     FROM broadcast_campaigns bc
     LEFT JOIN audience_segments asg ON asg.id = bc.segment_id
     WHERE bc.id = $1
     LIMIT 1`,
    [campaignId],
  );

  if (result.rowCount === 0) {
    throw new NotFoundError("Broadcast campaign not found");
  }

  const row = result.rows[0];
  const campaign = mapCampaignRow(row);

  return {
    ...campaign,
    audienceName: row.audience_name ?? (campaign.targetType === "segment" ? "Audience segment" : "Manual list"),
    segmentFilters: parseSegmentFilters(row.filters),
    sourceParsingId: row.source_parsing_id,
  } satisfies CampaignRuntimeContext;
}

export interface SegmentRecipient {
  username: string;
  channelId?: string | null;
}

export async function fetchSegmentRecipients(
  userId: string,
  sourceParsingId: string,
  filters?: NormalizedAudienceSegmentFilters | null,
): Promise<SegmentRecipient[]> {
  const values: unknown[] = [sourceParsingId, userId];
  const clauses = buildFilterClauses(filters, values);

  const query = `SELECT pc.username, pc.channel_id
                 FROM parsing_history ph
                 JOIN parsed_channels pc ON pc.parsing_history_id = ph.id
                 WHERE ph.id = $1 AND ph.user_id = $2
                 ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
                 ORDER BY pc.member_count DESC
                 LIMIT ${MAX_SEGMENT_RECIPIENTS}`;

  const result = await pgPool.query<{ username: string | null; channel_id: string | null }>(query, values);

  const recipients: SegmentRecipient[] = [];
  for (const row of result.rows) {
    if (row.username) {
      recipients.push({ username: row.username.startsWith("@") ? row.username : `@${row.username}`, channelId: row.channel_id });
    } else if (row.channel_id) {
      recipients.push({ username: row.channel_id, channelId: row.channel_id });
    }
  }

  return recipients.slice(0, MAX_SEGMENT_RECIPIENTS);
}

export async function finalizeCampaignRun(
  campaignId: string,
  status: BroadcastStatus,
  counts: { sent: number; failed: number; blocked: number },
  options?: { lastError?: string | null },
) {
  await pgPool.query(
    `UPDATE broadcast_campaigns
     SET status = $2,
         sent_count = $3,
         failed_count = $4,
         blocked_count = $5,
         completed_at = NOW(),
         last_error = $6
     WHERE id = $1`,
    [campaignId, status, counts.sent, counts.failed, counts.blocked, options?.lastError ?? null],
  );

  const totalAttempts = counts.sent + counts.failed + counts.blocked;
  await incrementBroadcastMessageUsage((await getCampaignRowById(campaignId)).user_id, totalAttempts);
}
