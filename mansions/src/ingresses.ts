import type { CalcRefusal } from "../../src/calc.js";
import { dateFrom } from "../../src/date-input.js";
import { calculateMansionAt } from "./at.js";
import type { MansionAtResult } from "./at.js";
import { searchLongitudeCrossingsWith } from "./engine.js";
import { getBoundaryTable } from "./tables.js";
import type { BoundaryTable, BoundaryTableId, RationalDegrees } from "./tables.js";
import { timeSeams } from "./time-seams.js";
import { checkOptions, readZodiac } from "./zodiac.js";
import type { MansionZodiac } from "./zodiac.js";

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
  readonly zodiac?: MansionZodiac;
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
  readonly zodiac: MansionZodiac;
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
  readonly tropicalReceipts: {
    readonly from: MansionAtResult["receipt"];
    readonly to: MansionAtResult["receipt"];
  };
}

// Local control flow only. Neither a budget nor an engine refusal returns
// partial ingresses, and unexpected calculation exceptions are not disguised.
class SearchRefused {
  constructor(readonly refusal: CalcRefusal) {}
}

/** Internal validation also used by the CLI before its calculation phase. */
export function readIngressRequest(request: MansionIngressRequest) {
  checkOptions(request, ["from", "to", "table", "maxSamples", "zodiac"], "Mansion ingress request");
  const table = getBoundaryTable(request.table);
  const zodiac = readZodiac(request.zodiac);
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
  return { from, to, table, zodiac, maxSamples };
}

/**
 * Search selected-zodiac mansion changes in (from,to] using the engine crossing
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
  const { from, to, table, zodiac, maxSamples } = readIngressRequest(request);
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
    const result = calculateMansionAt({ time: new Date(ms), table: table.id, zodiac }, () => {
      if (samples >= maxSamples) throw new SearchRefused(budgetRefusal());
      samples += 1;
    });
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
    const searchPiece = (pieceFrom: number, pieceTo: number) => {
      if (pieceFrom === pieceTo) return;
      // Rounded solver offsets can be zero at a window endpoint even when
      // exact rational membership changes in its neighboring millisecond.
      // Probe both edge milliseconds so clipping cannot lose that ingress.
      keep(pieceFrom + 1);
      keep(pieceTo);
      for (const [index, next] of table.mansions.entries()) {
        const previous = table.mansions[(index + table.mansions.length - 1) % table.mansions.length]!;
        const found = searchLongitudeCrossingsWith(
          (_body: "Moon", date) => sample(date.getTime()).longitude,
          "Moon", next.start.numerator / next.start.denominator,
          new Date(pieceFrom), new Date(pieceTo),
          // Engine evaluations are cached and budgeted by sample() across all
          // boundaries. A per-boundary solver budget would count cache hits.
          { stepDays }
        );
        if (found.status !== "complete") throw new Error("Unexpected unbudgeted crossing solver refusal.");
        for (const crossing of found.crossings) {
          const beforeMansion = crossing.retrograde ? next : previous;
          const afterMansion = crossing.retrograde ? previous : next;
          let low = Math.max(pieceFrom, crossing.at.getTime() - padding);
          let high = Math.min(pieceTo, crossing.at.getTime() + padding);
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
    };
    // The shared solver assumes smooth motion and merges nearby roots. Search
    // continuous pieces separately, and compare the two label milliseconds
    // across each clock step explicitly. A backwards step can cause a brief
    // reverse change and return that must survive as separate events.
    let pieceFrom = from;
    for (const seam of timeSeams(from, to)) {
      searchPiece(pieceFrom, seam - 1);
      keep(seam);
      pieceFrom = seam;
    }
    searchPiece(pieceFrom, to);
    const result: MansionIngressResult = {
      status: "ok", from: new Date(from).toISOString(), to: new Date(to).toISOString(),
      endpointConvention: "(from,to]", zodiac, table,
      ingresses: [...ingresses.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
      samples, maxSamples, stepDays, resolution: "first-changed-millisecond",
      receipts: { from: start.receipt, to: end.receipt },
      tropicalReceipts: { from: start.tropicalReceipt, to: end.tropicalReceipt }
    };
    return { status: "ok", result, fromPosition: start, toPosition: end };
  } catch (error) {
    if (error instanceof SearchRefused) return error.refusal;
    throw error;
  }
}
