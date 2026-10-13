import type { AttemptDisposition, AttemptResult } from "./storage-types.js";

export const DELIVERY_LIMITS = Object.freeze({
  maxAttempts: 100, baseDelayMs: 86_400_000, maxDelayMs: 604_800_000,
  leaseMs: 300_000, deadlineMs: 60_000,
});

/** Immutable once a delivery is first claimed. All durations are milliseconds. */
export interface DeliveryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly leaseMs: number;
}

export function parseDeliveryPolicy(input: DeliveryPolicy): DeliveryPolicy {
  try {
    const { maxAttempts, baseDelayMs, maxDelayMs, leaseMs } = input;
    const values = { maxAttempts, baseDelayMs, maxDelayMs, leaseMs };
    for (const field of Object.keys(values) as (keyof DeliveryPolicy)[]) {
      if (!Number.isSafeInteger(values[field]) || values[field] <= 0
        || values[field] > DELIVERY_LIMITS[field]) throw new Error();
    }
    if (maxDelayMs < baseDelayMs || leaseMs < 2) throw new Error();
    return Object.freeze(values);
  } catch { throw new Error("Invalid webhook delivery policy."); }
}

/** The cycle attempt number includes expired leases and cancelled/unsigned attempts. */
export function deliveryDisposition(policy: DeliveryPolicy, attemptNumber: number,
  result: AttemptResult, finishedAt: number): AttemptDisposition {
  if (result.kind === "http" && result.status >= 200 && result.status < 300) return { status: "delivered" };
  if (result.kind === "destination-rejected") return { status: "dead-letter", reason: "destination-rejected" };
  if (result.kind === "signing-error") return { status: "dead-letter", reason: "operator" };
  if (attemptNumber >= policy.maxAttempts) return { status: "dead-letter", reason: "attempts-exhausted" };
  const delay = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attemptNumber - 1));
  return { status: "pending", availableAt: finishedAt + delay };
}
