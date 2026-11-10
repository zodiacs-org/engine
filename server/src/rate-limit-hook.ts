import type { FastifyInstance } from "fastify";
import { TokenBuckets, DEFAULT_RATE_LIMIT, type RateLimitOptions } from "./rate-limit.js";
import { failure } from "./responses.js";

/** Authenticated requests share a bucket across routes for each configured key. */
export function registerRateLimiting(app: FastifyInstance, options: RateLimitOptions = DEFAULT_RATE_LIMIT, now?: () => number): void {
  const buckets = new TokenBuckets(options, now);
  const capacity = options.capacity;
  app.addHook("onRequest", async (request, reply) => {
    // Auth leaves the identity null only on public GET routes. Rejected auth never
    // reaches this hook. Bucket storage is thus bounded by configured keys.
    if (request.apiKeyId === null) return;
    const result = buckets.consume(request.apiKeyId);
    reply.header("x-ratelimit-limit", capacity);
    reply.header("x-ratelimit-remaining", result.remaining);
    if (!result.allowed) {
      return reply.code(429)
        .header("retry-after", result.retryAfterSeconds)
        .send(failure(request.id, "rate_limited", "API key request limit exceeded."));
    }
  });
}
