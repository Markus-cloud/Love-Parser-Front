import type { JwtPayload, User } from "./user";

export interface RequestContext {
  startTime: bigint;
  metricsStartTime?: bigint;
  hadError?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
    authPayload?: JwtPayload;
    accessToken?: string;
    requestContext?: RequestContext;
  }
}
