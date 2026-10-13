import { readFileSync } from "node:fs";
import { calc } from "../../src/calc.js";
import { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { COORDINATES, EngineRefused } from "../.cache/events-source/events/src/engine.js";
import { eclipseGeometry } from "../.cache/events-source/events/src/eclipses.js";
import type { EclipseEvent, EclipseKind, EclipseModel } from "../.cache/events-source/events/src/eclipses.js";
import { executeQuery } from "../.cache/events-source/events/src/search.js";
import { canonicalJson } from "./canonical-json.js";
import { utcDateTime } from "./content-line.js";
import { canonicalIdentityWindows, identifyEventBatch } from "./identity.js";
import { label } from "./validation.js";
import type { IdentityWindow, JsonObject, JsonValue, ScheduleEvent, UnidentifiedEvent } from "./types.js";

const DAY_MS = 86_400_000;
const BOUNDARY_POLICY = "utc-day-with-neighbor-days/1";
const source = JSON.parse(readFileSync(new URL("../events-source.json", import.meta.url), "utf8")) as {
  commit: string; engineTree: string;
};

export type { EclipseKind, EclipseModel };

export interface EclipseScheduleRequest {
  readonly namespace: string;
  readonly kind: EclipseKind;
  /** Canonical UTC instants. Events belong to (startUtc, endUtc]. */
  readonly startUtc: string;
  readonly endUtc: string;
  readonly clock: "utc";
  /** Positive integer milliseconds dividing a UTC day. */
  readonly stepMs: number;
  /** Central-difference half-width, positive integer milliseconds up to a UTC day. */
  readonly derivativeStepMs: number;
  /** Explicit spherical radii in au, without atmospheric enlargement. */
  readonly model: EclipseModel;
  /** Shared by all days, padding and both event-receipt calculations. */
  readonly maxEvaluations: number;
  readonly signal?: AbortSignal;
}

export type EclipseScheduleResult =
  | { readonly status: "complete"; readonly events: readonly ScheduleEvent[]; readonly evaluations: number }
  | { readonly status: "refused"; readonly reason: "evaluation-budget" | "cancelled" | "engine-refused";
      readonly events: readonly []; readonly evaluations: number };

function validate(input: EclipseScheduleRequest): EclipseScheduleRequest {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => ![
        "namespace", "kind", "startUtc", "endUtc", "clock", "stepMs", "derivativeStepMs",
        "model", "maxEvaluations", "signal"
      ].includes(key))) throw new TypeError("Unexpected eclipse schedule fields.");
  const request = { ...input };
  label(request.namespace, "identity namespace");
  if (request.kind !== "solar" && request.kind !== "lunar") throw new RangeError("Unsupported eclipse kind.");
  if (request.clock !== "utc") throw new RangeError("Calendar searches require an explicit UTC clock.");
  utcDateTime(request.startUtc);
  utcDateTime(request.endUtc);
  if (request.startUtc >= request.endUtc) throw new RangeError("A schedule requires a positive UTC range.");
  if (!Number.isSafeInteger(request.stepMs) || request.stepMs < 1 || DAY_MS % request.stepMs !== 0) {
    throw new RangeError("stepMs must be positive integer milliseconds dividing a UTC day.");
  }
  if (!Number.isSafeInteger(request.derivativeStepMs) || request.derivativeStepMs < 1 ||
      request.derivativeStepMs > DAY_MS) {
    throw new RangeError("derivativeStepMs must be positive integer milliseconds no greater than a UTC day.");
  }
  if (!Number.isSafeInteger(request.maxEvaluations) || request.maxEvaluations < 1) {
    throw new RangeError("A positive integer evaluation budget is required.");
  }
  if (request.signal !== undefined && !(request.signal instanceof AbortSignal)) {
    throw new TypeError("signal must be an AbortSignal.");
  }
  // Validate/detach JSON, then reuse the upstream model validation with fixed
  // nondegenerate vectors. This performs no ephemeris or event search work.
  const model = JSON.parse(canonicalJson(request.model as unknown as JsonValue)) as EclipseModel;
  eclipseGeometry(request.kind, { sun: [1, 0, 0], moon: [0.002, 0, 0] }, model);
  const firstDay = Math.floor(Date.parse(request.startUtc) / DAY_MS) * DAY_MS;
  const lastDay = Math.floor((Date.parse(request.endUtc) - 1) / DAY_MS) * DAY_MS;
  utcDateTime(new Date(firstDay - DAY_MS).toISOString());
  utcDateTime(new Date(lastDay + 2 * DAY_MS).toISOString());
  return { ...request, model: Object.freeze(model) };
}

function receiptEvent(event: EclipseEvent, window: IdentityWindow,
  request: EclipseScheduleRequest, context: EvaluationContext): UnidentifiedEvent {
  const utc = new Date(event.atMs).toISOString();
  const calculate = (body: "Sun" | "Moon") => {
    const position = context.evaluate(() => calc({
      body, time: utc, center: COORDINATES.center, frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
      flags: { correction: COORDINATES.correction, units: COORDINATES.units, cartesian: true, speeds: false }
    }));
    if (position.status === "refused") throw new EngineRefused(position);
    if (position.receipt.instants[0]?.utc !== utc || position.receipt.instants[0].timeScale.input !== "utc" ||
        !position.cartesian) throw new Error("Engine receipt does not describe the requested UTC eclipse vector.");
    return { receipt: position.receipt, cartesian: position.cartesian };
  };
  const calculations = { Sun: calculate("Sun"), Moon: calculate("Moon") };
  const receiptSource = JSON.parse(canonicalJson({
    adapter: "calendar-eclipse/1",
    upstream: { commit: source.commit, engineTree: source.engineTree, entry: "events/src/search.ts#executeQuery" },
    coordinates: COORDINATES,
    search: {
      mode: "all", clock: "utc", stepMs: request.stepMs, derivativeStepMs: request.derivativeStepMs,
      identityWindow: window, window: context.window, boundaryPolicy: BOUNDARY_POLICY,
      completeness: "scan-finished;conditional-on-continuous-isolated-slope-zero-per-cell"
    },
    event, calculations
  } as unknown as JsonValue)) as JsonObject;
  return {
    summary: `${event.kind === "solar" ? "Solar" : "Lunar"} eclipse (${event.classification}; minimum shadow-axis distance)`,
    chartIds: [],
    definition: {
      id: "spherical-shadow-axis-minimum/1",
      parameters: {
        ...COORDINATES, clock: "utc", kind: request.kind, model: { ...request.model },
        stepMs: request.stepMs, derivativeStepMs: request.derivativeStepMs,
        boundaryPolicy: BOUNDARY_POLICY
      }
    },
    receipt: {
      schema: "zodiacs-calendar-receipt/1", utc, eventType: "eclipse", bodies: ["Sun", "Moon", "Earth"],
      aspect: null, orbDegrees: null, engine: calculations.Sun.receipt.engine, source: receiptSource
    }
  };
}

/** Delegate to the pinned spherical-shadow search; no calendar-local event solver. */
export function searchEclipseSchedule(input: EclipseScheduleRequest): EclipseScheduleResult {
  const request = validate(input);
  let evaluations = 0;
  const events: ScheduleEvent[] = [];
  const refused = (reason: "evaluation-budget" | "cancelled" | "engine-refused"): EclipseScheduleResult =>
    ({ status: "refused", reason, events: [], evaluations });

  for (const window of canonicalIdentityWindows(request.startUtc, request.endUtc)) {
    if (request.signal?.aborted) return refused("cancelled");
    if (evaluations === request.maxEvaluations) return refused("evaluation-budget");
    // Both sides are padded to preserve central differences even immediately
    // after a day's start. Whole days retain the canonical scan grid.
    const padded = {
      startMs: Date.parse(window.startUtc) - DAY_MS,
      endMs: Date.parse(window.endUtc) + DAY_MS, clock: "utc" as const
    };
    const result = executeQuery({
      mode: "all", clock: "utc", event: { kind: "eclipse", eclipse: request.kind },
      range: { startMs: padded.startMs, endMs: padded.endMs }
    }, {
      stepMs: request.stepMs, eclipse: { model: request.model, derivativeStepMs: request.derivativeStepMs },
      maxEvaluations: request.maxEvaluations - evaluations,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });
    evaluations += result.evaluations;
    if (result.status === "refused") return refused(result.reason);
    if (result.unresolved.length !== 0) throw new Error("Unexpected unresolved eclipse search.");
    const owned: EclipseEvent[] = [];
    for (const event of result.events) {
      if (event.kind !== request.kind || event.clock !== "utc" || !Number.isSafeInteger(event.atMs) ||
          event.atMs <= padded.startMs + request.derivativeStepMs ||
          event.atMs > padded.endMs - request.derivativeStepMs) {
        throw new Error("Unexpected upstream eclipse result.");
      }
      if (event.atMs > Date.parse(window.startUtc) && event.atMs <= Date.parse(window.endUtc)) owned.push(event);
    }
    if (owned.length === 0) continue;
    if (evaluations === request.maxEvaluations) return refused("evaluation-budget");
    const context = new EvaluationContext(padded, {
      maxEvaluations: request.maxEvaluations - evaluations,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });
    try {
      const receipted = context.search(() => owned.map(event => receiptEvent(event, window, request, context)));
      if (receipted.status === "refused") {
        evaluations += context.evaluations;
        return refused(receipted.reason);
      }
      const batch = identifyEventBatch(request.namespace, { status: "complete", window, events: receipted.events });
      events.push(...batch.filter(event => event.receipt.utc > request.startUtc && event.receipt.utc <= request.endUtc));
    } catch (error) {
      if (!(error instanceof EngineRefused)) throw error;
      evaluations += context.evaluations;
      return refused("engine-refused");
    }
    evaluations += context.evaluations;
  }
  if (request.signal?.aborted) return refused("cancelled");
  return { status: "complete", events, evaluations };
}
