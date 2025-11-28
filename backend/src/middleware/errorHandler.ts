import { FastifyError, FastifyReply, FastifyRequest } from "fastify";

import { logErrorEvent } from "@/monitoring/errorLogService";
import { formatError } from "@/utils/errors";

export async function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  const formatted = formatError(error, request.id);
  const statusCode = formatted.error.statusCode;
  const severity = statusCode >= 500 ? "error" : "warn";

  await logErrorEvent(error, {
    severity,
    message: severity === "error" ? "Unhandled server error" : "Request failed",
    service: "api",
    requestId: request.id,
    userId: request.user?.id,
    errorCode: formatted.error.code,
    context: {
      method: request.method,
      path: request.url,
      status_code: statusCode,
      details: formatted.error.details,
    },
  });

  if (!reply.sent) {
    reply.status(statusCode).send(formatted);
  }
}
