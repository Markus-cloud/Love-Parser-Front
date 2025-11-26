import Fastify from "fastify";
import cors from "fastify-cors";
import fastifyJwt from "fastify-jwt";
import helmet from "@fastify/helmet";

import { registerHealthRoutes } from "@routes/health";
import { bootstrapQueues } from "@services/queue.service";
import { ensureTelegramClient } from "@services/telegram.service";
import { connectDatastores } from "@utils/clients";
import { env } from "@utils/env";
import { logger } from "@utils/logger";

async function buildServer() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN, credentials: true });
  await app.register(helmet);
  await app.register(fastifyJwt, { secret: env.JWT_SECRET });

  await app.register(registerHealthRoutes, { prefix: "/api" });

  return app;
}

async function start() {
  try {
    await connectDatastores();
    await bootstrapQueues();

    if (env.TELEGRAM_API_ID && env.TELEGRAM_API_HASH) {
      await ensureTelegramClient();
    }

    const server = await buildServer();
    await server.listen({ port: env.PORT, host: "0.0.0.0" });
    logger.info(`Backend listening on http://localhost:${env.PORT}`);
  } catch (error) {
    logger.error("Failed to start backend", { error });
    process.exit(1);
  }
}

void start();
