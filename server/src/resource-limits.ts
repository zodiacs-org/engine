/** Process limits are independent of per-key request allowances. */
export interface ResourceLimits {
  readonly maxConnections: number;
  readonly requestTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly calculationTimeoutMs: number;
  readonly calculationQueueSize: number;
}

export const DEFAULT_RESOURCE_LIMITS: Readonly<ResourceLimits> = Object.freeze({
  maxConnections: 128,
  requestTimeoutMs: 30_000,
  shutdownTimeoutMs: 10_000,
  calculationTimeoutMs: 5_000,
  calculationQueueSize: 8
});

export const HTTP_LIMITS = Object.freeze({
  headerBytes: 16_384,
  headersTimeoutMs: 10_000,
  timeoutCheckIntervalMs: 1_000,
  keepAliveTimeoutMs: 5_000
});

export const RESOURCE_RANGES = Object.freeze({
  maxConnections: [1, 10_000],
  requestTimeoutMs: [100, 120_000],
  shutdownTimeoutMs: [100, 30_000],
  calculationTimeoutMs: [100, 30_000],
  calculationQueueSize: [0, 64]
} as const);

export function resourceLimits(input: ResourceLimits = DEFAULT_RESOURCE_LIMITS): ResourceLimits {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Resource limits are invalid.");
  const result = { ...DEFAULT_RESOURCE_LIMITS };
  for (const key of Object.keys(RESOURCE_RANGES) as (keyof ResourceLimits)[]) {
    const [minimum, maximum] = RESOURCE_RANGES[key];
    const value = input[key];
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error("Resource limits are invalid.");
    result[key] = value;
  }
  return Object.freeze(result);
}
