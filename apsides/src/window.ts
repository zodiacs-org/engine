import type { CalcRefusal } from "@zodiacs/engine/calc";
import { searchLunarApsides } from "./lunar.js";
import type { LunarApsis } from "./lunar.js";
import { searchPlanetaryApsides } from "./planetary.js";
import type { PlanetaryApsis } from "./planetary.js";
import type {
  ApsisSearchDiagnostics, ApsisSearchOptions, ApsisSearchRefusalReason, ApsisSearchWindow
} from "./search.js";
import { distanceTarget, PLANETARY_BODIES } from "./targets.js";
import type { ApsisBody, DistanceTarget } from "./targets.js";
import { readSyzygyOrbDegrees } from "./syzygy.js";

/** Default selection and deterministic order for work and equal-time events. */
export const APSIS_BODIES = Object.freeze(["Moon", ...PLANETARY_BODIES] as const);
/** One cap for all selected bodies, including each body's endpoint calls. */
export const WINDOW_DEFAULT_MAX_EVALUATIONS = 100_000;

export interface ApsidesWindowOptions extends ApsisSearchOptions {
  /** Omission selects every APSIS_BODIES member. Explicit lists must be unique and nonempty. */
  readonly bodies?: readonly ApsisBody[];
  /** Optional angular lunar annotation; requires Moon in the selected bodies. */
  readonly syzygyOrbDegrees?: number;
}

export type ApsidesWindowEvent = LunarApsis | PlanetaryApsis;
/** Endpoint receipts belong to the per-body windows in diagnostics. */
export type ApsidesWindow = Pick<ApsisSearchWindow, "from" | "to" | "boundary">;

interface BodyIdentity {
  readonly body: ApsisBody;
  readonly target: DistanceTarget;
}

/** No per-body event arrays are retained on a combined refusal. */
export type ApsidesBodyDiagnostics = BodyIdentity & (
  | {
      readonly status: "complete";
      readonly window: ApsisSearchWindow;
      readonly diagnostics: ApsisSearchDiagnostics;
    }
  | {
      readonly status: "refused";
      readonly reason: ApsisSearchRefusalReason;
      readonly detail: string;
      readonly engineRefusal: CalcRefusal | null;
      readonly window: ApsisSearchWindow | null;
      readonly diagnostics: ApsisSearchDiagnostics;
    }
  | {
      readonly status: "not-started";
      readonly window: null;
      readonly diagnostics: null;
    }
);

export interface ApsidesWindowDiagnostics {
  readonly evaluations: number;
  readonly maxEvaluations: number;
  readonly completeness: "sampled-not-proven";
  /** Every selected body, in APSIS_BODIES order, even when work stops early. */
  readonly bodies: readonly ApsidesBodyDiagnostics[];
}

export type ApsidesWindowResult =
  | {
      readonly status: "complete";
      readonly window: ApsidesWindow;
      readonly events: readonly ApsidesWindowEvent[];
      readonly diagnostics: ApsidesWindowDiagnostics;
    }
  | {
      readonly status: "refused";
      /** The body that refused or could not start with the remaining budget. */
      readonly failedBody: ApsisBody;
      readonly reason: ApsisSearchRefusalReason;
      readonly detail: string;
      readonly engineRefusal: CalcRefusal | null;
      readonly window: ApsidesWindow | null;
      readonly events: readonly [];
      readonly diagnostics: ApsidesWindowDiagnostics;
    };

function readOptions(options: ApsidesWindowOptions): Required<Omit<ApsidesWindowOptions, "syzygyOrbDegrees">> & {
  readonly syzygyOrbDegrees: number | undefined;
} {
  const prototype: unknown = options !== null && typeof options === "object"
    ? Object.getPrototypeOf(options) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("Apsides window options must be a plain object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    const slot = Object.getOwnPropertyDescriptor(options, key);
    if (typeof key !== "string" || !["from", "to", "bodies", "maxEvaluations", "syzygyOrbDegrees"].includes(key) ||
      !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Apsides window options must contain only the named data properties.");
    }
  }
  if (!Object.hasOwn(options, "from") || !Object.hasOwn(options, "to")) {
    throw new RangeError("Apsides window requires from and to.");
  }
  const maxEvaluations = Object.hasOwn(options, "maxEvaluations")
    ? options.maxEvaluations : WINDOW_DEFAULT_MAX_EVALUATIONS;
  if (typeof maxEvaluations !== "number" || !Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1) {
    throw new RangeError("maxEvaluations must be a positive safe integer.");
  }
  const supplied = Object.hasOwn(options, "bodies") ? options.bodies : APSIS_BODIES;
  if (!Array.isArray(supplied) || supplied.length < 1 || supplied.length > APSIS_BODIES.length ||
    Reflect.ownKeys(supplied).length !== supplied.length + 1) {
    throw new RangeError("bodies must be a nonempty array of unique apsides bodies.");
  }
  const selected = new Set<ApsisBody>();
  for (let index = 0; index < supplied.length; index += 1) {
    const slot = Object.getOwnPropertyDescriptor(supplied, String(index));
    if (!slot || !("value" in slot) || !slot.enumerable ||
      !(APSIS_BODIES as readonly unknown[]).includes(slot.value) || selected.has(slot.value as ApsisBody)) {
      throw new RangeError("bodies must contain unique supported names in ordinary data slots.");
    }
    selected.add(slot.value as ApsisBody);
  }
  const syzygyOrbDegrees = readSyzygyOrbDegrees(options);
  if (syzygyOrbDegrees !== undefined && !selected.has("Moon")) {
    throw new RangeError("syzygyOrbDegrees requires Moon in bodies.");
  }
  return {
    from: options.from, to: options.to, maxEvaluations,
    bodies: APSIS_BODIES.filter((body) => selected.has(body)), syzygyOrbDegrees
  };
}

/**
 * Merge selected searches on their common TT window under one finite budget.
 * A failure discards every event. Completion describes sampled work, not proven
 * physical completeness or independent accuracy. Engine coverage refusals and
 * unavailable padding are preserved without clipping the requested interval.
 */
export function searchApsidesWindow(options: ApsidesWindowOptions): ApsidesWindowResult {
  const { from, to, bodies, maxEvaluations, syzygyOrbDegrees } = readOptions(options);
  const entries: ApsidesBodyDiagnostics[] = bodies.map((body) => ({
    body, target: distanceTarget(body), status: "not-started", window: null, diagnostics: null
  }));
  let evaluations = 0;
  let window: ApsidesWindow | null = null;
  let endpoints = { from, to };
  const events: ApsidesWindowEvent[] = [];
  const diagnostics = (): ApsidesWindowDiagnostics => ({
    evaluations, maxEvaluations, completeness: "sampled-not-proven", bodies: entries
  });
  for (const [index, body] of bodies.entries()) {
    const remaining = maxEvaluations - evaluations;
    if (remaining === 0) {
      return {
        status: "refused", failedBody: body, reason: "evaluation-budget",
        detail: "The combined apsides budget was exhausted before starting the next body.",
        engineRefusal: null, window, events: [], diagnostics: diagnostics()
      };
    }
    const input = { ...endpoints, maxEvaluations: remaining };
    const result = body === "Moon"
      ? searchLunarApsides({ ...input, ...(syzygyOrbDegrees === undefined ? {} : { syzygyOrbDegrees }) })
      : searchPlanetaryApsides(body, input);
    evaluations += result.diagnostics.evaluations;
    if (window === null && result.window !== null) {
      window = { from: result.window.from, to: result.window.to, boundary: result.window.boundary };
      // Reuse the engine's captured inputs, including endpoint pins. Re-reading
      // caller-owned nested time objects could give each body a different window.
      endpoints = {
        from: result.window.endpointReceipts.from.request.time,
        to: result.window.endpointReceipts.to.request.time
      };
    }
    const identity = { body, target: distanceTarget(body) };
    if (result.status === "refused") {
      entries[index] = {
        ...identity, status: "refused", reason: result.reason, detail: result.detail,
        engineRefusal: result.engineRefusal, window: result.window, diagnostics: result.diagnostics
      };
      return {
        status: "refused", failedBody: body, reason: result.reason, detail: result.detail,
        engineRefusal: result.engineRefusal, window, events: [], diagnostics: diagnostics()
      };
    }
    entries[index] = {
      ...identity, status: "complete", window: result.window, diagnostics: result.diagnostics
    };
    for (const event of result.events) events.push(event);
  }
  // Valid selection is nonempty, and every completed body resolved its window.
  if (window === null) throw new Error("Completed apsides search has no resolved window.");
  events.sort((left, right) => left.instant.jdTt - right.instant.jdTt ||
    APSIS_BODIES.indexOf(left.body) - APSIS_BODIES.indexOf(right.body));
  return { status: "complete", window, events, diagnostics: diagnostics() };
}
