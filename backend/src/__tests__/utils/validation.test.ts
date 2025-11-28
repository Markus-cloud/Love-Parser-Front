import { describe, expect, it } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { validateRequest } from "@/middleware/validateRequest";
import { ValidationError } from "@/utils/errors";

describe("validateRequest middleware", () => {
  const middleware = validateRequest({
    body: z.object({
      email: z.string().email(),
      name: z.string().min(2),
    }),
  });

  it("parses and replaces request payload", async () => {
    const request = { body: { email: "user@example.com", name: "Alice" } } as FastifyRequest;
    await middleware(request, {} as FastifyReply);
    expect(request.body).toEqual({ email: "user@example.com", name: "Alice" });
  });

  it("throws ValidationError for invalid payloads", async () => {
    const request = { body: { email: "broken", name: "A" } } as FastifyRequest;
    await expect(middleware(request, {} as FastifyReply)).rejects.toBeInstanceOf(ValidationError);
  });
});
