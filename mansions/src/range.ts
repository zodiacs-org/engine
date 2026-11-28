import type { CalcRefusal } from "../../src/calc.js";
import type { MansionAtResult } from "./at.js";
import { searchIngressWindow } from "./ingresses.js";
import type { MansionIngress, MansionIngressRequest, MansionIngressResult } from "./ingresses.js";
import type { MansionDefinition } from "./tables.js";

/** Same explicit table, UTC endpoint syntax and work budget as the ingress API. */
export type MansionRangeRequest = MansionIngressRequest;

export interface MansionOccupancy {
  /** Included start and excluded end, normalized UTC labels. */
  readonly start: string;
  readonly end: string;
  readonly mansion: MansionDefinition;
  /** True when no entry was observed inside (from,to]; no pre-window search. */
  readonly startClipped: boolean;
  /** True when end is the requested edge rather than an observed exit. */
  readonly endClipped: boolean;
  readonly startPosition: MansionAtResult;
  /** Position at the exclusive end; it can already occupy the next mansion. */
  readonly endPosition: MansionAtResult;
  /** Null at the requested left edge, even if that edge coincides with an ingress. */
  readonly entry: MansionIngress | null;
  readonly exit: MansionIngress | null;
}

export interface MansionRangeResult extends Omit<MansionIngressResult, "endpointConvention" | "ingresses"> {
  readonly endpointConvention: "[from,to)";
  readonly intervals: readonly MansionOccupancy[];
}

/**
 * Partition a requested UTC range into chronological, nonempty occupancy
 * intervals using the shared ingress search. No additional engine samples or
 * search outside the requested window are needed. Refusals contain no cells.
 */
export function mansionRange(request: MansionRangeRequest): MansionRangeResult | CalcRefusal {
  const window = searchIngressWindow(request);
  if (window.status === "refused") return window;
  const { result, fromPosition, toPosition } = window;
  const intervals: MansionOccupancy[] = [];
  let startPosition = fromPosition;
  let entry: MansionIngress | null = null;
  const append = (endPosition: MansionAtResult, exit: MansionIngress | null) => {
    if (startPosition.at === endPosition.at) return;
    intervals.push({
      start: startPosition.at, end: endPosition.at, mansion: startPosition.mansion,
      startClipped: entry === null, endClipped: exit === null,
      startPosition, endPosition, entry, exit
    });
  };
  for (const ingress of result.ingresses) {
    if (ingress.previous.mansion !== startPosition.mansion) return inconsistentWindow();
    append(ingress, ingress);
    startPosition = ingress;
    entry = ingress;
  }
  if (startPosition.mansion !== toPosition.mansion) return inconsistentWindow();
  append(toPosition, null);
  // Keep the existing search's receipts and accounting, without exposing a
  // second event list with different endpoint semantics in the range result.
  const { ingresses: _ingresses, ...metadata } = result;
  return { ...metadata, endpointConvention: "[from,to)", intervals };
}

function inconsistentWindow(): CalcRefusal {
  return {
    status: "refused", reason: "unsupported-combination",
    detail: "Mansion range endpoints and observed ingresses did not form a consistent occupancy sequence."
  };
}
