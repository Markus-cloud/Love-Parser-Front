import { FastifyReply, FastifyRequest } from "fastify";

import { AuthError } from "@/utils/errors";
import { JwtPayload, User } from "@/types/user";

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const payload = await request.jwtVerify<JwtPayload>();

    if (!payload.sub) {
      throw new AuthError("Authentication token is missing subject");
    }

    const authenticatedUser: User = {
      id: payload.sub,
      email: payload.email,
      role: payload.role ?? "user",
      permissions: payload.permissions ?? [],
      profile: payload.profile,
    };

    request.user = authenticatedUser;
  } catch (error) {
    throw new AuthError("Authentication token is invalid", { cause: error });
  }
}
