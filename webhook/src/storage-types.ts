import type { SubscriptionSpec } from "./types.js";

/** All storage times are integer Unix milliseconds. */
export interface StoredSubscription {
  readonly id: string;
  readonly revision: number;
  readonly spec: SubscriptionSpec;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
}

export interface ScanCursor {
  readonly subscriptionId: string;
  readonly revision: number;
  /** The next unscanned instant. May equal the exclusive schedule end. */
  readonly nextAt: number;
}

export interface NewEvent {
  readonly id: string;
  readonly occurrenceKey: string;
  readonly idempotencyKey: string;
  readonly occurredAt: number;
  /** Already serialized JSON object. Storage preserves its exact UTF-8 bytes. */
  readonly payload: string;
}

export interface StoredEvent extends NewEvent {
  readonly subscriptionId: string;
  readonly subscriptionRevision: number;
  readonly payloadSha256: string;
  readonly createdAt: number;
}

export interface ScanCommit {
  readonly subscriptionId: string;
  readonly expectedRevision: number;
  readonly from: number;
  readonly to: number;
  readonly now: number;
  readonly events: readonly NewEvent[];
}

export type DeliveryStatus = "pending" | "delivered" | "dead-letter";
export interface StoredDelivery {
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly callbackUrl: string;
  readonly secretRef: string;
  readonly status: DeliveryStatus;
  readonly availableAt: number;
  readonly attemptCount: number;
  readonly updatedAt: number;
}

export type AttemptResult =
  | { readonly kind: "http"; readonly status: number }
  | { readonly kind: "timeout" | "network-error" | "destination-rejected" };

export interface AttemptInput {
  readonly eventId: string;
  readonly number: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly result: AttemptResult;
}
export type StoredAttempt = AttemptInput;
export type DeadLetterReason = "attempts-exhausted" | "destination-rejected" | "operator";
/** The worker chooses retry policy later; storage only validates/persists this decision. */
export type AttemptDisposition =
  | { readonly status: "pending"; readonly availableAt: number }
  | { readonly status: "delivered" }
  | { readonly status: "dead-letter"; readonly reason: DeadLetterReason };

export interface StoredDeadLetter {
  readonly eventId: string;
  readonly attemptNumber: number;
  readonly reason: DeadLetterReason;
  readonly createdAt: number;
}

export interface Page {
  readonly afterId?: string;
  readonly limit?: number;
}
