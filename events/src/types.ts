/** Time coordinates in JavaScript epoch milliseconds, on a declared clock. */
export type Clock = "utc" | "ut1" | "tt";

/** Searches own events in (startMs, endMs]. Root brackets include both ends. */
export interface SearchWindow {
  readonly startMs: number;
  readonly endMs: number;
  readonly clock: Clock;
}

export interface SearchOptions {
  /** Adapter requests, including failed requests; internal engine samples are not separate units. */
  readonly maxEvaluations: number;
  readonly signal?: AbortSignal;
}

/** A refusal never contains a partial event list. */
export type SearchResult<T> =
  | { readonly status: "complete"; readonly events: readonly T[]; readonly evaluations: number }
  | { readonly status: "refused"; readonly reason: "evaluation-budget" | "cancelled";
      readonly events: readonly []; readonly evaluations: number };
