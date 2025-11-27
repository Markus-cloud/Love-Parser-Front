import { logger } from "@/utils/logger";

const DEFAULT_BASE_DELAY = 1_500;
const MIN_DELAY = 500;
const MAX_DELAY = 60_000;
const RANDOMIZATION_FACTOR = 0.2;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function calculateAdaptiveDelay(failureRate: number, accountAgeDays?: number) {
  const normalizedFailureRate = Number.isFinite(failureRate) ? clamp(failureRate, 0, 1) : 0;
  const normalizedAccountAge = Number.isFinite(accountAgeDays) && accountAgeDays !== undefined ? accountAgeDays : 365;

  let delay = DEFAULT_BASE_DELAY;

  if (normalizedFailureRate > 0.05) {
    delay += normalizedFailureRate * 4_000;
  }

  if (normalizedAccountAge < 30) {
    delay += 2_000;
  } else if (normalizedAccountAge < 90) {
    delay += 1_000;
  }

  return clamp(Math.round(delay), MIN_DELAY, MAX_DELAY);
}

export function randomizeDelay(baseDelay: number) {
  if (!Number.isFinite(baseDelay) || baseDelay <= 0) {
    return MIN_DELAY;
  }

  const jitter = baseDelay * RANDOMIZATION_FACTOR;
  const min = baseDelay - jitter;
  const max = baseDelay + jitter;
  const randomized = min + Math.random() * (max - min);
  return clamp(Math.round(randomized), MIN_DELAY, MAX_DELAY);
}

export function handleFloodWait(error: unknown): number | null {
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";

  const floodMatch = message.match(/FLOOD_WAIT_(\d+)/i);
  if (floodMatch) {
    const waitSeconds = Number(floodMatch[1]);
    if (!Number.isNaN(waitSeconds) && waitSeconds > 0) {
      logger.warn("Flood wait detected", { waitSeconds });
      return waitSeconds;
    }
  }

  return null;
}

export async function rotateSession(reason?: string) {
  logger.warn("Triggering Telegram session rotation", { reason });
}
