import { DEFAULT_RATE_LIMIT, validateRateLimit, type RateLimitOptions } from "./rate-limit.js";
import { DEFAULT_RESOURCE_LIMITS, resourceLimits, type ResourceLimits } from "./resource-limits.js";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = typeof LOG_LEVELS[number];

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: LogLevel;
  rateLimit: RateLimitOptions;
  limits: ResourceLimits;
}

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const host = env.HOST ?? "127.0.0.1";
  const portText = env.PORT ?? "3000";
  const logLevel = env.LOG_LEVEL ?? "info";
  if (host.length === 0 || /\s/u.test(host)) throw new Error("HOST is invalid.");
  if (!/^\d{1,5}$/u.test(portText) || Number(portText) > 65535) throw new Error("PORT is invalid.");
  if (!LOG_LEVELS.some((level) => level === logLevel)) throw new Error("LOG_LEVEL is invalid.");
  const capacity = env.RATE_LIMIT_CAPACITY ?? String(DEFAULT_RATE_LIMIT.capacity);
  const refill = env.RATE_LIMIT_REFILL_PER_SECOND ?? String(DEFAULT_RATE_LIMIT.refillPerSecond);
  if (!/^[0-9]{1,5}$/u.test(capacity) || !/^[0-9]{1,5}$/u.test(refill)) {
    throw new Error("Rate limit configuration is invalid.");
  }
  const rateLimit = { capacity: Number(capacity), refillPerSecond: Number(refill) };
  validateRateLimit(rateLimit);
  const limitNames = {
    maxConnections: "MAX_CONNECTIONS", requestTimeoutMs: "REQUEST_TIMEOUT_MS",
    shutdownTimeoutMs: "SHUTDOWN_TIMEOUT_MS", calculationTimeoutMs: "CALCULATION_TIMEOUT_MS",
    calculationQueueSize: "CALCULATION_QUEUE_SIZE"
  } as const;
  const values = { ...DEFAULT_RESOURCE_LIMITS };
  for (const name of Object.keys(limitNames) as (keyof ResourceLimits)[]) {
    const value = env[limitNames[name]];
    if (value === undefined) continue;
    if (!/^[0-9]{1,6}$/u.test(value)) throw new Error("Resource limits are invalid.");
    values[name] = Number(value);
  }
  return { host, port: Number(portText), logLevel: logLevel as LogLevel, rateLimit, limits: resourceLimits(values) };
}
