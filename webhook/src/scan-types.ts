import type { EventSearchRequest, EventSearchResult } from "./event-search-types.js";
import type { ScanCursor } from "./storage-types.js";
import type { ScheduleWindow } from "./types.js";

export interface ScanPolicy {
  /** Largest owned window per call, in milliseconds. Padding is additional. */
  readonly maxWindowMs: number;
  readonly stepMs: number;
  /** Per subscription, including padding, refinement and receipt capture. */
  readonly maxEvaluations: number;
  readonly eclipse?: EventSearchRequest["eclipse"];
}

export interface ScanRequest {
  /** Discovery time, in integer Unix milliseconds. */
  readonly now: number;
  /** Exclusive discovery horizon. May be later than now; deliveries wait for occurrence. */
  readonly through: number;
  readonly signal?: AbortSignal;
}

export interface ScanPageRequest extends ScanRequest {
  readonly afterId?: string;
  /** Bounds inspected subscriptions, including disabled and completed subscriptions. */
  readonly limit: number;
}

type SearchRefusal = Extract<EventSearchResult, { status: "refused" }>;
interface ScanContext {
  readonly subscriptionId: string;
  readonly window: ScheduleWindow;
  readonly evaluations: number;
}
export type ScanResult =
  | { readonly status: "idle"; readonly subscriptionId: string;
      readonly reason: "not-found" | "deleted" | "disabled" | "schedule-complete" | "not-due" }
  | (ScanContext & { readonly status: "committed"; readonly inserted: number;
      readonly duplicates: number; readonly cursor: ScanCursor })
  | (ScanContext & { readonly status: "conflict" })
  | (ScanContext & { readonly status: "refused";
      readonly reason: SearchRefusal["reason"] | "event-limit" | "payload-limit" | "policy-conflict" });

export interface ScanPageResult {
  readonly results: readonly ScanResult[];
  /** Resume after this id. Null means an empty page; start a new pass when exhausted. */
  readonly lastId: string | null;
  /** A full final page needs one empty page to establish exhaustion. */
  readonly exhausted: boolean;
}
