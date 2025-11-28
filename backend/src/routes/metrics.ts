import { FastifyPluginAsync } from "fastify";

import { metricsRegistry } from "@/monitoring/prometheus";

export const registerMetricsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/metrics", async (_, reply) => {
    reply.header("Content-Type", metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
};
