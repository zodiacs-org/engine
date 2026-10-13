import { readFileSync } from "node:fs";
import { calc } from "../../src/calc.js";
import { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { COORDINATES, EVENT_BODIES, EngineRefused } from "../.cache/events-source/events/src/engine.js";
import type { EventBody } from "../.cache/events-source/events/src/engine.js";
import type { SignIngress } from "../.cache/events-source/events/src/longitude.js";
import { executeQuery } from "../.cache/events-source/events/src/search.js";
import { canonicalJson } from "./canonical-json.js";
import { utcDateTime } from "./content-line.js";
import { canonicalIdentityWindows, identifyEventBatch } from "./identity.js";
import { label } from "./validation.js";
import type { IdentityWindow, JsonObject, JsonValue, ScheduleEvent, UnidentifiedEvent } from "./types.js";

const DAY_MS = 86_400_000;
const source = JSON.parse(readFileSync(new URL("../events-source.json", import.meta.url), "utf8")) as {
  commit: string; engineTree: string;
};

export interface IngressScheduleRequest {
  readonly namespace: string;
  readonly body: EventBody;
  /** Canonical UTC instants. Events belong to (startUtc, endUtc]. */
  readonly startUtc: string;
  readonly endUtc: string;
  /** TT and UT1 epoch labels are deliberately refused, never relabelled as UTC. */
  readonly clock: "utc";
  /** Positive integer milliseconds dividing a UTC day; an explicit sampling choice. */
  readonly stepMs: number;
  /** Total adapter requests across all days, padding and receipt calculations. */
  readonly maxEvaluations: number;
  readonly signal?: AbortSignal;
}

export type IngressScheduleResult =
  | { readonly status: "complete"; readonly events: readonly ScheduleEvent[]; readonly evaluations: number }
  | { readonly status: "refused"; readonly reason: "evaluation-budget" | "cancelled" | "engine-refused";
      readonly events: readonly []; readonly evaluations: number };

function validate(input: IngressScheduleRequest): IngressScheduleRequest {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => ![
        "namespace", "body", "startUtc", "endUtc", "clock", "stepMs", "maxEvaluations", "signal"
      ].includes(key))) throw new TypeError("Unexpected ingress schedule fields.");
  const request = { ...input };
  label(request.namespace, "identity namespace");
  if (!EVENT_BODIES.includes(request.body)) throw new RangeError("Unsupported ingress body.");
  if (request.clock !== "utc") throw new RangeError("Calendar searches require an explicit UTC clock.");
  utcDateTime(request.startUtc);
  utcDateTime(request.endUtc);
  if (request.startUtc >= request.endUtc) throw new RangeError("A schedule requires a positive UTC range.");
  if (!Number.isSafeInteger(request.stepMs) || request.stepMs < 1 || DAY_MS % request.stepMs !== 0) {
    throw new RangeError("stepMs must be positive integer milliseconds dividing a UTC day.");
  }
  if (!Number.isSafeInteger(request.maxEvaluations) || request.maxEvaluations < 1) {
    throw new RangeError("A positive integer evaluation budget is required.");
  }
  if (request.signal !== undefined && !(request.signal instanceof AbortSignal)) {
    throw new TypeError("signal must be an AbortSignal.");
  }
  // Check the latest possible padded end before any work is performed.
  const lastDay = Math.floor((Date.parse(request.endUtc) - 1) / DAY_MS) * DAY_MS;
  utcDateTime(new Date(lastDay + 2 * DAY_MS).toISOString());
  return request;
}

function receiptEvent(event: SignIngress, window: IdentityWindow,
  request: IngressScheduleRequest, context: EvaluationContext): UnidentifiedEvent {
  if (event.clock !== "utc" || event.body !== request.body || !Number.isSafeInteger(event.atMs)) {
    throw new Error("Upstream ingress has an incompatible clock, body or instant.");
  }
  const utc = new Date(event.atMs).toISOString();
  // The search retains numerical brackets; calc retains the full calculation receipt.
  const position = context.evaluate(() => calc({
    body: event.body, time: utc, center: COORDINATES.center,
    frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
    flags: { correction: COORDINATES.correction, units: COORDINATES.units, speeds: false }
  }));
  if (position.status === "refused") throw new EngineRefused(position);
  if (position.receipt.instants[0]?.utc !== utc || position.receipt.instants[0].timeScale.input !== "utc") {
    throw new Error("Engine receipt does not describe the requested UTC instant.");
  }
  // Canonical serialization validates and detaches the upstream JSON records.
  const receiptSource = JSON.parse(canonicalJson({
    adapter: "calendar-ingress/1",
    upstream: { commit: source.commit, engineTree: source.engineTree, entry: "events/src/search.ts#executeQuery" },
    coordinates: COORDINATES,
    search: {
      mode: "all", clock: "utc", stepMs: request.stepMs,
      identityWindow: window, window: context.window,
      boundaryPolicy: "utc-day-plus-following-day/1",
      completeness: "scan-finished;conditional-on-continuous-monotonic-short-arc-cells"
    },
    event, calculation: position.receipt
  } as unknown as JsonValue)) as JsonObject;
  return {
    summary: `${event.body} enters ${event.toSign}${event.direction === "retrograde" ? " (retrograde)" : ""}`,
    chartIds: [],
    definition: {
      id: "tropical-sign-ingress/1",
      parameters: {
        ...COORDINATES, clock: "utc", stepMs: request.stepMs,
        boundaryPolicy: "utc-day-plus-following-day/1",
        longitudeDegrees: event.longitude, direction: event.direction,
        fromSign: event.fromSign, toSign: event.toSign
      }
    },
    receipt: {
      schema: "zodiacs-calendar-receipt/1", utc, eventType: "ingress", bodies: [event.body],
      aspect: null, orbDegrees: Math.abs(event.residualDegrees),
      engine: position.receipt.engine, source: receiptSource
    }
  };
}

/**
 * Run the upstream DSL's all-ingress search on fixed UTC days, with a following
 * day to resolve sampled boundary touches. No event search is implemented here.
 * Complete means that the chosen scan finished, not proven astronomical coverage.
 */
export function searchIngressSchedule(input: IngressScheduleRequest): IngressScheduleResult {
  const request = validate(input);
  let evaluations = 0;
  const events: ScheduleEvent[] = [];
  const refused = (reason: "evaluation-budget" | "cancelled" | "engine-refused"): IngressScheduleResult =>
    ({ status: "refused", reason, events: [], evaluations });

  for (const window of canonicalIdentityWindows(request.startUtc, request.endUtc)) {
    if (request.signal?.aborted) return refused("cancelled");
    if (evaluations === request.maxEvaluations) return refused("evaluation-budget");
    const padded = {
      startMs: Date.parse(window.startUtc), endMs: Date.parse(window.endUtc) + DAY_MS, clock: "utc" as const
    };
    // Never use next mode for ordinal identities, even for a narrow display range.
    const result = executeQuery({
      mode: "all", clock: "utc", event: { kind: "ingress", body: request.body, sign: null },
      range: { startMs: padded.startMs, endMs: padded.endMs }
    }, {
      stepMs: request.stepMs, maxEvaluations: request.maxEvaluations - evaluations,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });
    evaluations += result.evaluations;
    if (result.status === "refused") return refused(result.reason);
    if (result.unresolved.length !== 0) throw new Error("Unexpected unresolved ingress search.");
    const owned: SignIngress[] = [];
    for (const event of result.events) {
      if (event.kind !== "sign-ingress" || event.clock !== "utc" || event.body !== request.body ||
          !Number.isSafeInteger(event.atMs) || event.atMs <= padded.startMs || event.atMs > padded.endMs) {
        throw new Error("Unexpected upstream ingress result.");
      }
      if (event.atMs <= Date.parse(window.endUtc)) owned.push(event);
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
