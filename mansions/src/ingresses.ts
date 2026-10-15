import type { CalcRefusal } from "../../src/calc.js";
import { dateFrom } from "../../src/date-input.js";
import { mansionAt } from "./at.js";
import type { MansionAtResult } from "./at.js";
import { searchLongitudeCrossingsWith } from "./engine.js";
import { getBoundaryTable } from "./tables.js";
import type { BoundaryTable, BoundaryTableId, RationalDegrees } from "./tables.js";

const DAY_MS = 86_400_000;

/** Fixed work limits, not claims about astronomical accuracy or completeness. */
export const INGRESS_SEARCH_LIMITS = Object.freeze({
  stepDays: 0.25,
  maxDays: 366,
  defaultMaxSamples: 20_000,
  maxSamples: 100_000
});

export interface MansionIngressRequest {
  /** ISO or Date endpoints, read on the engine's UTC basis, without pinned delta-T. */
  readonly from: string | Date;
  readonly to: string | Date;
  readonly table: BoundaryTableId;
  /** Shared budget for all engine evaluations, including endpoints and refinement. */
  readonly maxSamples?: number;
}

/** A change of classification between adjacent integer milliseconds. */
export interface MansionIngress extends MansionAtResult {
  readonly direction: "direct" | "retrograde";
  /** Exact table boundary, independent of the rounded solver target. */
  readonly boundary: RationalDegrees;
  /** Classification and unmodified engine receipt at at minus one millisecond. */
  readonly previous: MansionAtResult;
}

export interface MansionIngressResult {
  readonly status: "ok";
  readonly from: string;
  readonly to: string;
  readonly endpointConvention: "(from,to]";
  readonly zodiac: "tropical";
  readonly table: BoundaryTable;
  readonly ingresses: readonly MansionIngress[];
  /** Actual engine evaluations, including endpoint checks and output receipts. */
  readonly samples: number;
  readonly maxSamples: number;
  readonly stepDays: number;
  readonly resolution: "first-changed-millisecond";
  /** Endpoint receipts are present even when no ingress occurs. */
  readonly receipts: {
    readonly from: MansionAtResult["receipt"];
    readonly to: MansionAtResult["receipt"];
  };
}

// Local control flow only. Neither a budget nor an engine refusal returns
// partial ingresses, and unexpected calculation exceptions are not disguised.
class SearchRefused {
  constructor(readonly refusal: CalcRefusal) {}
}

function readRequest(request: MansionIngressRequest) {
  const prototype: unknown = request !== null && typeof request === "object"
    ? Object.getPrototypeOf(request) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("Mansion ingress request must be a plain options object.");
  }
  for (const key of Reflect.ownKeys(request)) {
    const slot = Object.getOwnPropertyDescriptor(request, key);
    if (!["from", "to", "table", "maxSamples"].includes(key as string)
      || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Mansion ingress request takes only from, to, table and maxSamples as data properties.");
    }
  }
  const table = getBoundaryTable(request.table);
  const endpoint = (value: string | Date, label: string) => {
    if (typeof value !== "string" && !(value instanceof Date)) {
      throw new RangeError(`${label} must be an ISO string or Date on the engine's UTC basis.`);
    }
    return dateFrom(value, label).getTime();
  };
  const from = endpoint(request.from, "from");
  const to = endpoint(request.to, "to");
  if (from > to) throw new RangeError("Mansion ingress window must have from <= to.");
  if (to - from > INGRESS_SEARCH_LIMITS.maxDays * DAY_MS) {
    throw new RangeError(`Mansion ingress window must span at most ${INGRESS_SEARCH_LIMITS.maxDays} elapsed days.`);
  }
  const maxSamples = request.maxSamples === undefined ? INGRESS_SEARCH_LIMITS.defaultMaxSamples : request.maxSamples;
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > INGRESS_SEARCH_LIMITS.maxSamples) {
    throw new RangeError(`maxSamples must be an integer from 1 to ${INGRESS_SEARCH_LIMITS.maxSamples}.`);
  }
  return { from, to, table, maxSamples };
}

/**
 * Search tropical mansion changes in (from,to] using the engine crossing
 * solver. Each root is verified against exact rational classification at
 * adjacent milliseconds. Resolution describes the computed model only.
 */
export function mansionIngresses(request: MansionIngressRequest): MansionIngressResult | CalcRefusal {
  const window = searchIngressWindow(request);
  return window.status === "refused" ? window : window.result;
}

/** Internal shared search: occupancy intervals reuse already budgeted samples. */
export function searchIngressWindow(request: MansionIngressRequest): {
  readonly status: "ok";
  readonly result: MansionIngressResult;
  readonly fromPosition: MansionAtResult;
  readonly toPosition: MansionAtResult;
} | CalcRefusal {
  const { from, to, table, maxSamples } = readRequest(request);
  const { stepDays } = INGRESS_SEARCH_LIMITS;
  const cache = new Map<number, MansionAtResult>();
  let samples = 0;
  const budgetRefusal = (): CalcRefusal => ({
    status: "refused", reason: "sample-budget", samples, maxSamples,
    detail: "Mansion ingress search exceeded its shared engine evaluation budget."
  });
  const sample = (ms: number): MansionAtResult => {
    const cached = cache.get(ms);
    if (cached !== undefined) return cached;
    if (samples >= maxSamples) throw new SearchRefused(budgetRefusal());
    samples += 1;
    const result = mansionAt({ time: new Date(ms), table: table.id });
    if (result.status === "refused") throw new SearchRefused(result);
    cache.set(ms, result);
    return result;
  };

  try {
    const start = sample(from);
    const end = sample(to);
    const ingresses = new Map<number, MansionIngress>();
    const keep = (ms: number) => {
      const at = sample(ms);
      const before = sample(ms - 1);
      if (at.mansion === before.mansion) return;
      const count = table.mansions.length;
      const direct = at.mansion.index === before.mansion.index % count + 1;
      const retrograde = before.mansion.index === at.mansion.index % count + 1;
      if (!direct && !retrograde) {
        throw new SearchRefused({
          status: "refused", reason: "unsupported-combination",
          detail: "A crossing was not an adjacent mansion change."
        });
      }
      ingresses.set(ms, {
        ...at, direction: direct ? "direct" : "retrograde",
        boundary: direct ? at.mansion.start : before.mansion.start,
        previous: before
      });
    };
    // The solver's bisection uses rounded binary64 targets and Date truncation.
    // Enclose that numerical root, then use exact table classification to
    // settle the first changed millisecond. Never sample outside the window.
    const padding = Math.ceil(stepDays * DAY_MS / 2 ** 24) + 2;
    if (from !== to) {
      // Rounded solver offsets can be zero at a window endpoint even when
      // exact rational membership changes in its neighboring millisecond.
      // Probe both edge milliseconds so clipping cannot lose that ingress.
      keep(from + 1);
      keep(to);
      for (const [index, next] of table.mansions.entries()) {
        const previous = table.mansions[(index + table.mansions.length - 1) % table.mansions.length]!;
        const found = searchLongitudeCrossingsWith(
          (_body: "Moon", date) => sample(date.getTime()).longitude,
          "Moon", next.start.numerator / next.start.denominator,
          new Date(from), new Date(to),
          // Engine evaluations are cached and budgeted by sample() across all
          // boundaries. A per-boundary solver budget would count cache hits.
          { stepDays }
        );
        if (found.status !== "complete") throw new Error("Unexpected unbudgeted crossing solver refusal.");
        for (const crossing of found.crossings) {
          const beforeMansion = crossing.retrograde ? next : previous;
          const afterMansion = crossing.retrograde ? previous : next;
          let low = Math.max(from, crossing.at.getTime() - padding);
          let high = Math.min(to, crossing.at.getTime() + padding);
          const lower = sample(low);
          const upper = sample(high);
          // A touch, or an approximate root just outside the requested window,
          // is not a change. The left endpoint's change is excluded as well.
          if (lower.mansion === upper.mansion) continue;
          if (lower.mansion !== beforeMansion || upper.mansion !== afterMansion) {
            throw new SearchRefused({
              status: "refused", reason: "unsupported-combination",
              detail: "A crossing could not be bracketed as an adjacent mansion change."
            });
          }
          while (high - low > 1) {
            const middle = Math.floor((low + high) / 2);
            if (sample(middle).mansion === beforeMansion) low = middle;
            else high = middle;
          }
          const at = sample(high);
          const before = sample(high - 1);
          if (at.mansion !== afterMansion || before.mansion !== beforeMansion) {
            throw new SearchRefused({
              status: "refused", reason: "unsupported-combination",
              detail: "A crossing did not verify at adjacent milliseconds."
            });
          }
          keep(high);
        }
      }
    }
    const result: MansionIngressResult = {
      status: "ok", from: new Date(from).toISOString(), to: new Date(to).toISOString(),
      endpointConvention: "(from,to]", zodiac: "tropical", table,
      ingresses: [...ingresses.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
      samples, maxSamples, stepDays, resolution: "first-changed-millisecond",
      receipts: { from: start.receipt, to: end.receipt }
    };
    return { status: "ok", result, fromPosition: start, toPosition: end };
  } catch (error) {
    if (error instanceof SearchRefused) return error.refusal;
    throw error;
  }
}
