import { readFileSync } from "node:fs";
import { natalChart } from "../../src/index.js";
import { calc } from "../../src/calc.js";
import { createNatalEnvelope } from "../../src/receipt.js";
import type { NatalEnvelope } from "../../src/receipt.js";
import { EvaluationContext, SearchInterrupted } from "../.cache/events-source/events/src/context.js";
import { COORDINATES, EVENT_BODIES, EngineRefused } from "../.cache/events-source/events/src/engine.js";
import type { EventBody } from "../.cache/events-source/events/src/engine.js";
import { searchExactAspects, snapshotAspectRules } from "../.cache/events-source/events/src/aspects.js";
import type { ExactAspect, ExactAspectPolicy } from "../.cache/events-source/events/src/aspects.js";
import { canonicalJson } from "./canonical-json.js";
import { utcDateTime } from "./content-line.js";
import { canonicalIdentityWindows, identifyEventBatch } from "./identity.js";
import { label } from "./validation.js";
import { snapshotSyntheticNatal } from "./synthetic-natal.js";
import type { SyntheticNatalInput } from "./synthetic-natal.js";
export type { SyntheticNatalInput } from "./synthetic-natal.js";
import type { IngressScheduleRequest, IngressScheduleResult } from "./ingresses.js";
import type { IdentityWindow, JsonObject, JsonValue, ScheduleEvent, UnidentifiedEvent } from "./types.js";

const DAY_MS = 86_400_000;
const BOUNDARY_POLICY = "utc-day-plus-following-day/1";
const source = JSON.parse(readFileSync(new URL("../events-source.json", import.meta.url), "utf8")) as {
  commit: string; engineTree: string;
};

export interface NatalTransitScheduleRequest extends IngressScheduleRequest {
  readonly natal: SyntheticNatalInput;
  readonly natalBody: EventBody;
  /** Exact longitude contacts, with no in-orb windows or applying/separating allowance. */
  readonly policy: ExactAspectPolicy;
}

export type NatalTransitScheduleResult = IngressScheduleResult;

function fields(value: unknown, allowed: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) {
    throw new TypeError("Unexpected natal transit schedule fields.");
  }
}

export function validateNatalTransitScheduleRequest(input: NatalTransitScheduleRequest): NatalTransitScheduleRequest {
  fields(input, ["namespace", "body", "natalBody", "natal", "policy", "startUtc", "endUtc",
    "clock", "stepMs", "maxEvaluations", "signal"]);
  const request = { ...input };
  label(request.namespace, "identity namespace");
  if (!EVENT_BODIES.includes(request.body) || !EVENT_BODIES.includes(request.natalBody)) {
    throw new RangeError("Unsupported transit or natal body.");
  }
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
  const lastDay = Math.floor((Date.parse(request.endUtc) - 1) / DAY_MS) * DAY_MS;
  utcDateTime(new Date(lastDay + 2 * DAY_MS).toISOString());

  // Capture only plain JSON chart/policy data before engine calls or cancellation.
  const natal = snapshotSyntheticNatal(request.natal);
  const policy = JSON.parse(canonicalJson(request.policy as unknown as JsonValue)) as ExactAspectPolicy;
  return { ...request, natal,
    policy: { aspects: snapshotAspectRules(policy) } };
}

function paddedWindow(window: IdentityWindow) {
  return { startMs: Date.parse(window.startUtc), endMs: Date.parse(window.endUtc) + DAY_MS, clock: "utc" as const };
}

function receiptEvent(event: ExactAspect, window: IdentityWindow, request: NatalTransitScheduleRequest,
  natal: NatalEnvelope, context: EvaluationContext): UnidentifiedEvent {
  const utc = new Date(event.atMs).toISOString();
  const position = context.evaluate(() => calc({
    body: event.body, time: utc, center: COORDINATES.center,
    frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
    flags: { correction: COORDINATES.correction, units: COORDINATES.units, speeds: false }
  }));
  if (position.status === "refused") throw new EngineRefused(position);
  if (position.receipt.instants[0]?.utc !== utc || position.receipt.instants[0].timeScale.input !== "utc") {
    throw new Error("Engine receipt does not describe the requested UTC instant.");
  }
  const receiptSource = JSON.parse(canonicalJson({
    adapter: "calendar-natal-transit/1",
    upstream: { commit: source.commit, engineTree: source.engineTree, entry: "events/src/aspects.ts#searchExactAspects" },
    coordinates: COORDINATES, policy: request.policy,
    natal: { chartId: request.natal.id, synthetic: true, calculation: natal },
    search: {
      mode: "all", clock: "utc", stepMs: request.stepMs,
      identityWindow: window, window: context.window, boundaryPolicy: BOUNDARY_POLICY,
      completeness: "scan-finished;conditional-on-continuous-monotonic-short-arc-cells"
    },
    event, calculation: position.receipt
  } as unknown as JsonValue)) as JsonObject;
  return {
    summary: `${event.body} ${event.aspect.id} natal ${request.natalBody}${event.direction === "retrograde" ? " (retrograde)" : ""}`,
    chartIds: [request.natal.id],
    definition: {
      id: "tropical-natal-transit/1",
      parameters: {
        ...COORDINATES, clock: "utc", stepMs: request.stepMs, boundaryPolicy: BOUNDARY_POLICY,
        target: "fixed-natal-longitude", natalBirth: request.natal.birth as unknown as JsonObject,
        aspectAnglesDegrees: request.policy.aspects.map(rule => rule.angleDegrees).sort((a, b) => a - b),
        relativeLongitude: event.relativeLongitude, direction: event.direction
      }
    },
    receipt: {
      schema: "zodiacs-calendar-receipt/1", utc, eventType: "natal-transit",
      bodies: [event.body, request.natalBody], aspect: { name: event.aspect.id, angleDegrees: event.aspect.angleDegrees },
      orbDegrees: Math.abs(event.residualDegrees), engine: position.receipt.engine, source: receiptSource
    }
  };
}

/** Delegate all exact contacts to the pinned search; no event solver lives here. */
export function searchNatalTransitSchedule(input: NatalTransitScheduleRequest): NatalTransitScheduleResult {
  const request = validateNatalTransitScheduleRequest(input);
  let evaluations = 0;
  const events: ScheduleEvent[] = [];
  const refused = (reason: "evaluation-budget" | "cancelled" | "engine-refused"): NatalTransitScheduleResult =>
    ({ status: "refused", reason, events: [], evaluations });
  const contextFor = (window: IdentityWindow) => new EvaluationContext(paddedWindow(window), {
    maxEvaluations: request.maxEvaluations - evaluations,
    ...(request.signal === undefined ? {} : { signal: request.signal })
  });
  let natal: NatalEnvelope | undefined;
  let targetLongitude: number | undefined;
  for (const window of canonicalIdentityWindows(request.startUtc, request.endUtc)) {
    if (request.signal?.aborted) return refused("cancelled");
    if (evaluations === request.maxEvaluations) return refused("evaluation-budget");
    const context = contextFor(window);
    try {
      if (natal === undefined) {
        natal = context.evaluate(() => createNatalEnvelope(natalChart(request.natal.birth), {
          sourceInstant: request.natal.birth.utc
        }));
        targetLongitude = natal.result.bodies.find(body => body.body === request.natalBody)?.lon;
        if (targetLongitude === undefined || !Number.isFinite(targetLongitude)) {
          throw new Error("Natal calculation is missing the requested body.");
        }
      }
      const result = searchExactAspects(context, request.body,
        { kind: "fixed", longitude: targetLongitude! }, request.policy, { stepMs: request.stepMs });
      if (result.status === "refused") {
        evaluations += context.evaluations;
        return refused(result.reason);
      }
      const owned: ExactAspect[] = [];
      for (const event of result.events) {
        if (event.kind !== "exact-aspect" || event.clock !== "utc" || event.body !== request.body ||
            !Number.isSafeInteger(event.atMs) || !context.owns(event.atMs) ||
            event.target.kind !== "fixed" || event.target.longitude !== targetLongitude ||
            !request.policy.aspects.some(rule => rule.id === event.aspect.id && rule.angleDegrees === event.aspect.angleDegrees) ||
            ![event.aspect.angleDegrees, (360 - event.aspect.angleDegrees) % 360].includes(event.relativeLongitude)) {
          throw new Error("Unexpected upstream natal transit result.");
        }
        if (event.atMs <= Date.parse(window.endUtc)) owned.push(event);
      }
      const rows = owned.map(event => receiptEvent(event, window, request, natal!, context));
      const batch = identifyEventBatch(request.namespace, { status: "complete", window, events: rows });
      events.push(...batch.filter(event => event.receipt.utc > request.startUtc && event.receipt.utc <= request.endUtc));
      context.checkpoint();
    } catch (error) {
      evaluations += context.evaluations;
      if (error instanceof SearchInterrupted) return refused(error.reason);
      if (error instanceof EngineRefused) return refused("engine-refused");
      throw error;
    }
    evaluations += context.evaluations;
  }
  if (request.signal?.aborted) return refused("cancelled");
  return { status: "complete", events, evaluations };
}
