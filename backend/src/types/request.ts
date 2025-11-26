import type { User } from "./user";

export interface RequestContext {
  startTime: bigint;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
    requestContext?: RequestContext;
  }
}
