import { captureWithSentry, logger } from "@/monitoring/errorLogger";
import { pgPool } from "@/utils/clients";

export type LogSeverity = "error" | "warn" | "info" | "debug";

export interface PersistErrorLogInput {
  userId?: string | null;
  service?: string;
  errorCode?: string | null;
  errorMessage: string;
  stackTrace?: string | null;
  context?: Record<string, unknown>;
}

export interface LogErrorEventOptions {
  message?: string;
  service?: string;
  requestId?: string;
  userId?: string;
  errorCode?: string;
  context?: Record<string, unknown>;
  severity?: LogSeverity;
}

export async function persistErrorLog(input: PersistErrorLogInput) {
  try {
    await pgPool.query(
      `INSERT INTO error_logs (user_id, service, error_code, error_message, stack_trace, context)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.userId ?? null,
        input.service ?? "backend",
        input.errorCode ?? null,
        input.errorMessage,
        input.stackTrace ?? null,
        JSON.stringify(input.context ?? {}),
      ],
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to persist error log", error);
  }
}

export async function logErrorEvent(error: unknown, options?: LogErrorEventOptions) {
  const severity: LogSeverity = options?.severity ?? "error";
  const service = options?.service ?? "backend";
  const normalizedError =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unexpected error");
  const message = options?.message ?? normalizedError.message ?? "Unexpected error";

  const context = {
    request_id: options?.requestId,
    user_id: options?.userId,
    service,
    ...options?.context,
  } satisfies Record<string, unknown>;

  logger.log({
    level: severity,
    message,
    error: normalizedError,
    ...context,
  });

  if (severity === "error") {
    captureWithSentry(normalizedError, context);
  }

  if (severity === "error" || severity === "warn") {
    await persistErrorLog({
      userId: options?.userId,
      service,
      errorCode: options?.errorCode,
      errorMessage: message,
      stackTrace: normalizedError.stack ?? null,
      context,
    });
  }
}
