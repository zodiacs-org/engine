import { readFileSync } from "node:fs";
import { natalChart } from "../../src/index.js";
import { progressedInstant, PROGRESSION_DAYS_PER_YEAR } from "../../src/progressions.js";
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
import { snapshotSyntheticNatal } from "./synthetic-natal.js";
import type { SyntheticNatalInput } from "./synthetic-natal.js";
import { label } from "./validation.js";
import type { IngressScheduleRequest, IngressScheduleResult } from "./ingresses.js";
import type { IdentityWindow, JsonObject, JsonValue, ScheduleEvent, UnidentifiedEvent } from "./types.js";

const DAY_MS = 86_400_000;
const CONVENTION = "secondary-progressed-first-to-natal-second/1";
const BOUNDARY_POLICY = "utc-day-plus-following-day/1";
const source = JSON.parse(readFileSync(new URL("../events-source.json", import.meta.url), "utf8")) as {
  commit: string; engineTree: string;
};

export interface SynastryScheduleRequest extends Omit<IngressScheduleRequest, "body"> {
  /** Required: static natal synastry alone has no occurrence time. */
  readonly convention: typeof CONVENTION;
  readonly first: SyntheticNatalInput;
  readonly second: SyntheticNatalInput;
  /** Secondary-progressed body of first, measured on the engine's ordinary UTC basis. */
  readonly firstBody: EventBody;
  /** Fixed natal body of second, retaining second's natal Delta T setting. */
  readonly secondBody: EventBody;
  /** Calendar milliseconds, at least 1000 and dividing a UTC day. */
  readonly stepMs: number;
  readonly policy: ExactAspectPolicy;
}
export type SynastryScheduleResult = IngressScheduleResult;

function validate(input: SynastryScheduleRequest): SynastryScheduleRequest {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => ![
        "namespace", "first", "second", "firstBody", "secondBody", "convention", "policy",
        "startUtc", "endUtc", "clock", "stepMs", "maxEvaluations", "signal"
      ].includes(key))) throw new TypeError("Unexpected synastry schedule fields.");
  const request = { ...input };
  label(request.namespace, "identity namespace");
  if (request.convention !== CONVENTION) throw new RangeError("An explicit supported moving synastry convention is required.");
  if (!EVENT_BODIES.includes(request.firstBody) || !EVENT_BODIES.includes(request.secondBody)) {
    throw new RangeError("Unsupported first or second body.");
  }
  if (request.clock !== "utc") throw new RangeError("Calendar searches require an explicit UTC clock.");
  utcDateTime(request.startUtc);
  utcDateTime(request.endUtc);
  if (request.startUtc >= request.endUtc) throw new RangeError("A schedule requires a positive UTC range.");
  // The engine truncates the mapped epoch to milliseconds (toward zero). Keep
  // coarse samples farther apart than even the double-width bin at epoch zero.
  if (!Number.isSafeInteger(request.stepMs) || request.stepMs < 1_000 || DAY_MS % request.stepMs !== 0) {
    throw new RangeError("stepMs must be integer milliseconds, at least 1000, dividing a UTC day.");
  }
  if (!Number.isSafeInteger(request.maxEvaluations) || request.maxEvaluations < 1) {
    throw new RangeError("A positive integer evaluation budget is required.");
  }
  if (request.signal !== undefined && !(request.signal instanceof AbortSignal)) {
    throw new TypeError("signal must be an AbortSignal.");
  }
  const lastDay = Math.floor((Date.parse(request.endUtc) - 1) / DAY_MS) * DAY_MS;
  utcDateTime(new Date(lastDay + 2 * DAY_MS).toISOString());
  const first = snapshotSyntheticNatal(request.first);
  const second = snapshotSyntheticNatal(request.second);
  if (first.id === second.id) throw new RangeError("Synastry requires distinct chart identities.");
  const policy = JSON.parse(canonicalJson(request.policy as unknown as JsonValue)) as ExactAspectPolicy;
  return { ...request, first, second, policy: { aspects: snapshotAspectRules(policy) } };
}

/** Only the position provider changes; crossing detection remains upstream. */
function progressedPosition(body: EventBody, atMs: number, birthUtc: string, context: EvaluationContext) {
  if (!Number.isSafeInteger(atMs) || atMs < context.window.startMs || atMs > context.window.endMs) {
    throw new RangeError("Progressed sample is outside the UTC search window.");
  }
  return context.evaluate(() => {
    const progressedUtc = progressedInstant(birthUtc, atMs).toISOString();
    const position = calc({
      body, time: progressedUtc, center: COORDINATES.center,
      frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
      flags: { correction: COORDINATES.correction, units: COORDINATES.units, speeds: false }
    });
    if (position.status === "refused") throw new EngineRefused(position);
    if (!Number.isFinite(position.lon) || position.lon < 0 || position.lon >= 360 ||
        position.receipt.instants[0]?.utc !== progressedUtc ||
        position.receipt.instants[0].timeScale.input !== "utc") {
      throw new Error("Engine receipt does not describe a valid progressed UTC position.");
    }
    return { progressedUtc, position };
  });
}

function receiptEvent(event: ExactAspect, window: IdentityWindow, request: SynastryScheduleRequest,
  first: NatalEnvelope, second: NatalEnvelope, context: EvaluationContext): UnidentifiedEvent {
  const utc = new Date(event.atMs).toISOString();
  const { progressedUtc, position } = progressedPosition(event.body, event.atMs, request.first.birth.utc, context);
  const receiptSource = JSON.parse(canonicalJson({
    adapter: "calendar-synastry/1", convention: CONVENTION,
    upstream: { commit: source.commit, engineTree: source.engineTree, entry: "events/src/aspects.ts#searchExactAspects" },
    coordinates: COORDINATES, policy: request.policy,
    first: { chartId: request.first.id, synthetic: true, calculation: first },
    second: { chartId: request.second.id, synthetic: true, calculation: second },
    progression: {
      method: "engine.progressedInstant", daysPerYear: PROGRESSION_DAYS_PER_YEAR,
      birthUtc: request.first.birth.utc, scheduleUtc: utc, calculationUtc: progressedUtc,
      deltaT: "engine-default-at-progressed-instant", precision: "integer-millisecond-progressed-epoch"
    },
    search: {
      mode: "all", clock: "utc", stepMs: request.stepMs,
      identityWindow: window, window: context.window, boundaryPolicy: BOUNDARY_POLICY,
      completeness: "scan-finished;conditional-on-monotonic-short-arc-cells;quantized-progressed-epoch"
    },
    event, calculation: position.receipt
  } as unknown as JsonValue)) as JsonObject;
  return {
    summary: `Secondary-progressed first ${event.body} ${event.aspect.id} natal second ${request.secondBody}${event.direction === "retrograde" ? " (retrograde)" : ""}`,
    chartIds: [request.first.id, request.second.id],
    definition: {
      id: CONVENTION,
      parameters: {
        ...COORDINATES, clock: "utc", stepMs: request.stepMs, boundaryPolicy: BOUNDARY_POLICY,
        firstBirth: request.first.birth as unknown as JsonObject,
        secondBirth: request.second.birth as unknown as JsonObject,
        progressionDaysPerYear: PROGRESSION_DAYS_PER_YEAR,
        progressedDeltaT: "engine-default-at-progressed-instant",
        aspectAnglesDegrees: request.policy.aspects.map(rule => rule.angleDegrees).sort((a, b) => a - b),
        relativeLongitude: event.relativeLongitude, direction: event.direction
      }
    },
    receipt: {
      schema: "zodiacs-calendar-receipt/1", utc, eventType: "synastry-exact",
      bodies: [event.body, request.secondBody], aspect: { name: event.aspect.id, angleDegrees: event.aspect.angleDegrees },
      orbDegrees: Math.abs(event.residualDegrees), engine: position.receipt.engine, source: receiptSource
    }
  };
}

/** Search first's secondary-progressed longitude against second's fixed natal longitude. */
export function searchSynastrySchedule(input: SynastryScheduleRequest): SynastryScheduleResult {
  const request = validate(input);
  let evaluations = 0;
  const events: ScheduleEvent[] = [];
  const refused = (reason: "evaluation-budget" | "cancelled" | "engine-refused"): SynastryScheduleResult =>
    ({ status: "refused", reason, events: [], evaluations });
  let first: NatalEnvelope | undefined;
  let second: NatalEnvelope | undefined;
  let targetLongitude: number | undefined;
  for (const window of canonicalIdentityWindows(request.startUtc, request.endUtc)) {
    if (request.signal?.aborted) return refused("cancelled");
    if (evaluations === request.maxEvaluations) return refused("evaluation-budget");
    const context = new EvaluationContext({
      startMs: Date.parse(window.startUtc), endMs: Date.parse(window.endUtc) + DAY_MS, clock: "utc"
    }, { maxEvaluations: request.maxEvaluations - evaluations,
      ...(request.signal === undefined ? {} : { signal: request.signal }) });
    try {
      if (first === undefined) {
        first = context.evaluate(() => createNatalEnvelope(natalChart(request.first.birth), {
          sourceInstant: request.first.birth.utc
        }));
        second = context.evaluate(() => createNatalEnvelope(natalChart(request.second.birth), {
          sourceInstant: request.second.birth.utc
        }));
        targetLongitude = second.result.bodies.find(body => body.body === request.secondBody)?.lon;
        if (targetLongitude === undefined || !Number.isFinite(targetLongitude)) {
          throw new Error("Second natal calculation is missing the requested body.");
        }
      }
      const result = searchExactAspects(context, request.firstBody,
        { kind: "fixed", longitude: targetLongitude! }, request.policy, { stepMs: request.stepMs }, {
          context, sample: (body, atMs) => ({
            longitude: progressedPosition(body, atMs, request.first.birth.utc, context).position.lon
          })
        });
      if (result.status === "refused") {
        evaluations += context.evaluations;
        return refused(result.reason);
      }
      const owned: ExactAspect[] = [];
      for (const event of result.events) {
        if (event.kind !== "exact-aspect" || event.clock !== "utc" || event.body !== request.firstBody ||
            !Number.isSafeInteger(event.atMs) || !context.owns(event.atMs) ||
            event.target.kind !== "fixed" || event.target.longitude !== targetLongitude ||
            !request.policy.aspects.some(rule => rule.id === event.aspect.id && rule.angleDegrees === event.aspect.angleDegrees) ||
            ![event.aspect.angleDegrees, (360 - event.aspect.angleDegrees) % 360].includes(event.relativeLongitude)) {
          throw new Error("Unexpected upstream progressed synastry result.");
        }
        if (event.atMs <= Date.parse(window.endUtc)) owned.push(event);
      }
      const rows = owned.map(event => receiptEvent(event, window, request, first!, second!, context));
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
