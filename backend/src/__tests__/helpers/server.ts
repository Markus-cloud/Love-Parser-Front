import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";

import { config } from "@/config/config";
import { createServer } from "@/server";

export async function buildTestServer(): Promise<FastifyInstance> {
  const app = await createServer();
  await app.ready();
  return app;
}

export function buildAuthHeader(userId: string) {
  const token = jwt.sign({ sub: userId }, config.security.jwtSecret, { expiresIn: "1h" });
  return `Bearer ${token}`;
}
