import { readFileSync } from "node:fs";
import { calc } from "../../src/calc.js";
import { EvaluationContext, SearchInterrupted } from "../.cache/events-source/events/src/context.js";
import { COORDINATES, EVENT_BODIES, EngineRefused } from "../.cache/events-source/events/src/engine.js";
import { snapshotAspectRules } from "../.cache/events-source/events/src/aspects.js";
import { searchVoidOfCourseMoon } from "../.cache/events-source/events/src/void.js";
import type { VoidOfCoursePolicy, VoidOfCourseInterval, UnresolvedMoonSegment } from "../.cache/events-source/events/src/void.js";
import { SIGNS } from "../.cache/events-source/events/src/longitude.js";
import { canonicalJson } from "./canonical-json.js";
import { utcDateTime } from "./content-line.js";
import { canonicalIdentityWindows, createEventIdentity, eventUid } from "./identity.js";
import { label } from "./validation.js";
import type { IdentityWindow, JsonObject, JsonValue, ScheduleEvent } from "./types.js";

const DAY_MS = 86_400_000;
const HALO_DAYS = 4;
const BOUNDARY_POLICY = "full-interval;utc-exit-day;four-day-halo/1";
const source = JSON.parse(readFileSync(new URL("../events-source.json", import.meta.url), "utf8")) as {
  commit: string; engineTree: string;
};

export interface VoidOfCourseScheduleRequest {
  readonly namespace: string;
  /** Intervals overlap [startUtc, endUtc); full boundaries are retained. */
  readonly startUtc: string;
  readonly endUtc: string;
  readonly clock: "utc";
  /** Explicit non-Moon bodies and exact aspect angles, without orb windows. */
  readonly policy: VoidOfCoursePolicy;
  /** Positive integer milliseconds dividing a UTC day. */
  readonly stepMs: number;
  readonly maxEvaluations: number;
  readonly signal?: AbortSignal;
}

export interface UnresolvedVoidOfCourseBoundary {
  readonly reason: "next-ingress-outside-window" | "interval-start-outside-window";
  readonly startUtc: string;
  readonly endUtc: string;
  readonly sign: string;
  readonly identityWindow: IdentityWindow;
  readonly searchWindow: { readonly startMs: number; readonly endMs: number; readonly clock: "utc" };
}

export type VoidOfCourseScheduleResult =
  | { readonly status: "complete"; readonly events: readonly ScheduleEvent[]; readonly evaluations: number }
  | { readonly status: "refused"; readonly reason: "evaluation-budget" | "cancelled" | "engine-refused";
      readonly events: readonly []; readonly evaluations: number }
  | { readonly status: "refused"; readonly reason: "unresolved-interval"; readonly events: readonly [];
      readonly evaluations: number; readonly unresolved: readonly UnresolvedVoidOfCourseBoundary[] };

export function validateVoidOfCourseScheduleRequest(input: VoidOfCourseScheduleRequest): VoidOfCourseScheduleRequest {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => ![
        "namespace", "startUtc", "endUtc", "clock", "policy", "stepMs", "maxEvaluations", "signal"
      ].includes(key))) throw new TypeError("Unexpected void-of-course schedule fields.");
  const request = { ...input };
  label(request.namespace, "identity namespace");
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
  const policy = JSON.parse(canonicalJson(request.policy as unknown as JsonValue)) as VoidOfCoursePolicy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
      Object.keys(policy).some(key => !["bodies", "aspects"].includes(key)) ||
      !Array.isArray(policy.bodies) || policy.bodies.length === 0 ||
      policy.bodies.some(body => body === "Moon" || !EVENT_BODIES.includes(body)) ||
      new Set(policy.bodies).size !== policy.bodies.length) {
    throw new RangeError("An explicit nonempty unique policy of non-Moon bodies is required.");
  }
  const aspects = snapshotAspectRules({ aspects: policy.aspects });
  // Order does not change the selected contact set. Keep ties deterministic.
  const snapshot = { bodies: [...policy.bodies].sort(), aspects: [...aspects].sort((a, b) => a.angleDegrees - b.angleDegrees) };
  const firstDay = Math.floor(Date.parse(request.startUtc) / DAY_MS) * DAY_MS;
  const lastDay = Math.floor((Date.parse(request.endUtc) - 1) / DAY_MS) * DAY_MS;
  utcDateTime(new Date(firstDay - HALO_DAYS * DAY_MS).toISOString());
  utcDateTime(new Date(lastDay + (2 * HALO_DAYS + 1) * DAY_MS).toISOString());
  return { ...request, policy: snapshot };
}

function intersects(start: number, end: number, rangeStart: number, rangeEnd: number): boolean {
  return start < rangeEnd && end > rangeStart;
}

function checkInterval(event: VoidOfCourseInterval, context: EvaluationContext, request: VoidOfCourseScheduleRequest): void {
  if (event.kind !== "void-of-course" || event.clock !== "utc" || !SIGNS.includes(event.sign) ||
      !Number.isSafeInteger(event.startMs) || !Number.isSafeInteger(event.endMs) ||
      event.startMs < context.window.startMs || event.startMs >= event.endMs || event.endMs > context.window.endMs ||
      typeof event.clippedStart !== "boolean") throw new Error("Unexpected upstream void-of-course interval.");
  const contact = event.lastContact;
  if (contact !== null && (contact.kind !== "exact-aspect" || contact.clock !== "utc" || contact.body !== "Moon" ||
      contact.atMs !== event.startMs || contact.target.kind !== "moving" ||
      !request.policy.bodies.includes(contact.target.body) || event.clippedStart ||
      !request.policy.aspects.some(rule => rule.id === contact.aspect.id && rule.angleDegrees === contact.aspect.angleDegrees))) {
    throw new Error("Unexpected upstream void-of-course last contact.");
  }
}

function receiptEvent(event: VoidOfCourseInterval, ordinal: number, window: IdentityWindow,
  request: VoidOfCourseScheduleRequest, context: EvaluationContext): ScheduleEvent {
  const utc = new Date(event.startMs).toISOString();
  const endUtc = new Date(event.endMs).toISOString();
  const calculation = (body: "Moon" | (typeof request.policy.bodies)[number], at: string) => {
    const position = context.evaluate(() => calc({
      body, time: at, center: COORDINATES.center, frame: COORDINATES.frame, zodiac: COORDINATES.zodiac,
      flags: { correction: COORDINATES.correction, units: COORDINATES.units, speeds: false }
    }));
    if (position.status === "refused") throw new EngineRefused(position);
    if (position.receipt.instants[0]?.utc !== at || position.receipt.instants[0].timeScale.input !== "utc") {
      throw new Error("Engine receipt does not describe the requested UTC instant.");
    }
    return position;
  };
  const start = calculation("Moon", utc);
  const end = calculation("Moon", endUtc);
  const target = event.lastContact?.target;
  const lastContactTarget = target?.kind === "moving" ? calculation(target.body, utc) : null;
  const bodies = ["Moon", ...request.policy.bodies];
  const identity = createEventIdentity({
    schema: "zodiacs-calendar-event/1", namespace: request.namespace, eventType: "void-of-course",
    bodies, chartIds: [], aspectAngleDegrees: null,
    definition: {
      id: "sign-last-exact-contact-void-moon/1",
      parameters: {
        ...COORDINATES, clock: "utc", stepMs: request.stepMs, boundaryPolicy: BOUNDARY_POLICY,
        sign: event.sign, aspectAnglesDegrees: request.policy.aspects.map(rule => rule.angleDegrees)
      }
    },
    occurrence: { scheme: "source-key/1", key: `moon-sign-exit/1:${window.startUtc}:${ordinal}` }
  });
  const receiptSource = JSON.parse(canonicalJson({
    adapter: "calendar-void-of-course/1",
    upstream: { commit: source.commit, engineTree: source.engineTree, entry: "events/src/void.ts#searchVoidOfCourseMoon" },
    coordinates: COORDINATES, policy: request.policy,
    search: {
      mode: "all", clock: "utc", stepMs: request.stepMs, identityWindow: window, window: context.window,
      boundaryPolicy: BOUNDARY_POLICY, completeness: "scan-finished;conditional-on-continuous-monotonic-short-arc-cells"
    },
    event, boundaries: { startUtc: utc, endUtc, startKind: event.lastContact === null ? "sign-entry" : "last-exact-contact",
      endKind: "sign-exit", endExclusive: true, clipped: false },
    calculations: { start: start.receipt, end: end.receipt, lastContactTarget: lastContactTarget?.receipt ?? null },
    lastContactOrbDegrees: event.lastContact === null ? null : Math.abs(event.lastContact.residualDegrees)
  } as unknown as JsonValue)) as JsonObject;
  return {
    uid: eventUid(identity), identity, summary: `Void-of-course Moon in ${event.sign}`, endUtc,
    receipt: {
      schema: "zodiacs-calendar-receipt/1", utc, eventType: "void-of-course", bodies,
      aspect: null, orbDegrees: null, engine: start.receipt.engine, source: receiptSource
    }
  };
}

/** Full intervals intersecting the display range, delegated to the pinned search. */
export function searchVoidOfCourseSchedule(input: VoidOfCourseScheduleRequest): VoidOfCourseScheduleResult {
  const request = validateVoidOfCourseScheduleRequest(input);
  const rangeStart = Date.parse(request.startUtc);
  const rangeEnd = Date.parse(request.endUtc);
  let evaluations = 0;
  const events: ScheduleEvent[] = [];
  const refused = (reason: "evaluation-budget" | "cancelled" | "engine-refused"): VoidOfCourseScheduleResult =>
    ({ status: "refused", reason, events: [], evaluations });
  // Enumerate exit days beyond the display end, so an interval can end later.
  const exitEnd = new Date(rangeEnd + HALO_DAYS * DAY_MS).toISOString();
  for (const window of canonicalIdentityWindows(request.startUtc, exitEnd)) {
    if (request.signal?.aborted) return refused("cancelled");
    if (evaluations === request.maxEvaluations) return refused("evaluation-budget");
    const dayStart = Date.parse(window.startUtc);
    const dayEnd = Date.parse(window.endUtc);
    const padded = { startMs: dayStart - HALO_DAYS * DAY_MS, endMs: dayEnd + HALO_DAYS * DAY_MS, clock: "utc" as const };
    const context = new EvaluationContext(padded, {
      maxEvaluations: request.maxEvaluations - evaluations,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });
    try {
      const result = searchVoidOfCourseMoon(context, request.policy, { stepMs: request.stepMs });
      if (result.status === "refused") {
        evaluations += context.evaluations;
        return refused(result.reason);
      }
      const unresolved: UnresolvedVoidOfCourseBoundary[] = [];
      const diagnostic = (segment: UnresolvedMoonSegment | VoidOfCourseInterval, reason: UnresolvedVoidOfCourseBoundary["reason"]) => ({
        reason, startUtc: new Date(segment.startMs).toISOString(), endUtc: new Date(segment.endMs).toISOString(),
        sign: segment.sign, identityWindow: window, searchWindow: padded
      });
      for (const segment of result.unresolved) {
        if (!Number.isSafeInteger(segment.startMs) || !Number.isSafeInteger(segment.endMs) ||
            segment.startMs < padded.startMs || segment.startMs >= segment.endMs || segment.endMs !== padded.endMs ||
            segment.reason !== "next-ingress-outside-window" || !SIGNS.includes(segment.sign)) {
          throw new Error("Unexpected upstream unresolved Moon segment.");
        }
        // Only this day's displayed coverage matters; padding tails are expected.
        if (intersects(segment.startMs, segment.endMs, Math.max(dayStart, rangeStart), Math.min(dayEnd, rangeEnd)) &&
            dayStart < rangeEnd) unresolved.push(diagnostic(segment, segment.reason));
      }
      const ordinals = new Map<string, number>();
      for (const event of result.events) {
        checkInterval(event, context, request);
        if (event.endMs <= dayStart || event.endMs > dayEnd) continue;
        const ordinal = ordinals.get(event.sign) ?? 0;
        ordinals.set(event.sign, ordinal + 1);
        if (!intersects(event.startMs, event.endMs, rangeStart, rangeEnd)) continue;
        if (event.clippedStart) {
          unresolved.push(diagnostic(event, "interval-start-outside-window"));
          continue;
        }
        events.push(receiptEvent(event, ordinal, window, request, context));
      }
      context.checkpoint();
      if (unresolved.length !== 0) {
        evaluations += context.evaluations;
        return { status: "refused", reason: "unresolved-interval", events: [], evaluations, unresolved };
      }
    } catch (error) {
      evaluations += context.evaluations;
      if (error instanceof SearchInterrupted) return refused(error.reason);
      if (error instanceof EngineRefused) return refused("engine-refused");
      throw error;
    }
    evaluations += context.evaluations;
  }
  if (request.signal?.aborted) return refused("cancelled");
  events.sort((a, b) => a.receipt.utc.localeCompare(b.receipt.utc) || a.uid.localeCompare(b.uid));
  return { status: "complete", events, evaluations };
}
