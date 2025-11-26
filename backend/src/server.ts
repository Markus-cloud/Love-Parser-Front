import { randomUUID } from "node:crypto";

import Fastify, { FastifyInstance } from "fastify";
import cors from "fastify-cors";
import fastifyJwt from "fastify-jwt";
import helmet from "@fastify/helmet";

import { config } from "@/config/config";
import { errorHandler } from "@/middleware/errorHandler";
import { rateLimitMiddleware } from "@/middleware/rateLimitMiddleware";
import { registerRequestLogger } from "@/middleware/requestLogger";
import { registerHealthRoutes } from "@/routes/health";

function getRequestId(headers: Record<string, string | string[] | undefined>) {
  const headerValue = headers[config.server.requestIdHeader] ?? headers["x-request-id"];
  if (typeof headerValue === "string" && headerValue.length > 0) {
    return headerValue;
  }

  if (Array.isArray(headerValue) && headerValue.length > 0) {
    return headerValue[0];
  }

  return randomUUID();
}

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: config.server.bodyLimit,
    requestIdHeader: config.server.requestIdHeader,
    genReqId: (request) => getRequestId(request.headers as Record<string, string | string[] | undefined>),
  });

  await app.register(cors, {
    origin: config.server.corsOrigins,
    credentials: true,
  });

  await app.register(helmet);
  await app.register(fastifyJwt, { secret: config.security.jwtSecret });

  registerRequestLogger(app);
  app.addHook("preHandler", rateLimitMiddleware);
  app.setErrorHandler(errorHandler);

  await app.register(registerHealthRoutes, { prefix: "/api" });

  return app;
}
