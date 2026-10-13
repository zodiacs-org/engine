import { setImmediate as yieldToHost } from "node:timers/promises";
import { canonicalJson } from "./canonical-json.js";
import { utcDateTime } from "./content-line.js";
import { calendarEvent, calendarHeader } from "./serialize.js";
import { searchIngressSchedule, validateIngressScheduleRequest } from "./ingresses.js";
import type { IngressScheduleRequest } from "./ingresses.js";
import { searchNatalTransitSchedule, validateNatalTransitScheduleRequest } from "./natal-transits.js";
import type { NatalTransitScheduleRequest } from "./natal-transits.js";
import { searchSynastrySchedule, validateSynastryScheduleRequest } from "./synastry.js";
import type { SynastryScheduleRequest } from "./synastry.js";
import { searchStationSchedule, validateStationScheduleRequest } from "./stations.js";
import type { StationScheduleRequest } from "./stations.js";
import { searchEclipseSchedule, validateEclipseScheduleRequest } from "./eclipses.js";
import type { EclipseScheduleRequest } from "./eclipses.js";
import { searchVoidOfCourseSchedule, validateVoidOfCourseScheduleRequest } from "./void-of-course.js";
import type { VoidOfCourseScheduleRequest, VoidOfCourseScheduleResult } from "./void-of-course.js";
import type { CalendarOptions, JsonValue, ScheduleEvent } from "./types.js";

type SharedFields = "startUtc" | "endUtc" | "maxEvaluations" | "signal";
export type ScheduleSelection =
  | { readonly kind: "ingress"; readonly request: Omit<IngressScheduleRequest, SharedFields> }
  | { readonly kind: "natal-transit"; readonly request: Omit<NatalTransitScheduleRequest, SharedFields> }
  | { readonly kind: "synastry-exact"; readonly request: Omit<SynastryScheduleRequest, SharedFields> }
  | { readonly kind: "station"; readonly request: Omit<StationScheduleRequest, SharedFields> }
  | { readonly kind: "eclipse"; readonly request: Omit<EclipseScheduleRequest, SharedFields> }
  | { readonly kind: "void-of-course"; readonly request: Omit<VoidOfCourseScheduleRequest, SharedFields> };

export interface ScheduleStreamRequest {
  readonly startUtc: string;
  readonly endUtc: string;
  /** Shared total, including repeated adapter padding and chart receipts. */
  readonly maxEvaluations: number;
  /** Positive integer UTC-day durations, at most 31, measured from startUtc. */
  readonly windowDays: number;
  /** Cap on collected records per window, including duplicate selections. */
  readonly maxBufferedEvents: number;
  readonly schedules: readonly ScheduleSelection[];
  readonly signal?: AbortSignal;
}

export interface ScheduleStreamSummary {
  readonly status: "complete";
  readonly evaluations: number;
  readonly emitted: number;
  readonly windows: number;
}

export type ScheduleStreamFailure = "evaluation-budget" | "cancelled" | "engine-refused" |
  "unresolved-interval" | "buffer-budget";

/** Earlier events may have escaped; this error is never an empty successful result. */
export class ScheduleStreamError extends Error {
  constructor(
    readonly reason: ScheduleStreamFailure,
    readonly evaluations: number,
    readonly emitted: number,
    readonly window: { readonly startUtc: string; readonly endUtc: string },
    readonly selectionIndex?: number,
    options?: ErrorOptions
  ) {
    super(`Schedule stream refused: ${reason}.`, options);
    this.name = "ScheduleStreamError";
  }
}

type Bounds = Pick<IngressScheduleRequest, SharedFields>;

function validateSelection(selection: ScheduleSelection, bounds: Bounds): void {
  switch (selection.kind) {
    case "ingress": validateIngressScheduleRequest({ ...selection.request, ...bounds }); break;
    case "natal-transit": validateNatalTransitScheduleRequest({ ...selection.request, ...bounds }); break;
    case "synastry-exact": validateSynastryScheduleRequest({ ...selection.request, ...bounds }); break;
    case "station": validateStationScheduleRequest({ ...selection.request, ...bounds }); break;
    case "eclipse": validateEclipseScheduleRequest({ ...selection.request, ...bounds }); break;
    case "void-of-course": validateVoidOfCourseScheduleRequest({ ...selection.request, ...bounds }); break;
    default: throw new RangeError("Unsupported streaming schedule kind.");
  }
}

function search(selection: ScheduleSelection, bounds: Bounds): VoidOfCourseScheduleResult {
  switch (selection.kind) {
    case "ingress": return searchIngressSchedule({ ...selection.request, ...bounds });
    case "natal-transit": return searchNatalTransitSchedule({ ...selection.request, ...bounds });
    case "synastry-exact": return searchSynastrySchedule({ ...selection.request, ...bounds });
    case "station": return searchStationSchedule({ ...selection.request, ...bounds });
    case "eclipse": return searchEclipseSchedule({ ...selection.request, ...bounds });
    case "void-of-course": return searchVoidOfCourseSchedule({ ...selection.request, ...bounds });
  }
}

function snapshot(input: ScheduleStreamRequest): ScheduleStreamRequest {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key =>
    !["startUtc", "endUtc", "maxEvaluations", "windowDays", "maxBufferedEvents", "schedules", "signal"].includes(key))) {
    throw new TypeError("Unexpected schedule stream fields.");
  }
  const { signal, ...data } = input;
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("signal must be an AbortSignal.");
  const request = JSON.parse(canonicalJson(data as unknown as JsonValue)) as ScheduleStreamRequest;
  utcDateTime(request.startUtc);
  utcDateTime(request.endUtc);
  if (request.startUtc >= request.endUtc) throw new RangeError("A stream requires a positive UTC range.");
  for (const value of [request.maxEvaluations, request.maxBufferedEvents, request.windowDays]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("Stream work limits must be positive safe integers.");
  }
  if (request.windowDays > 31) throw new RangeError("windowDays must be at most 31.");
  if (!Array.isArray(request.schedules) || request.schedules.length === 0) {
    throw new RangeError("A stream requires schedule selections.");
  }
  for (const selection of request.schedules) {
    if (!selection || typeof selection !== "object" || Object.keys(selection).some(key => !["kind", "request"].includes(key)) ||
        !selection.request || typeof selection.request !== "object" || Array.isArray(selection.request) ||
        Object.keys(selection.request).some(key => ["startUtc", "endUtc", "maxEvaluations", "signal"].includes(key))) {
      throw new TypeError("Unexpected streaming selection fields.");
    }
    validateSelection(selection, { startUtc: request.startUtc, endUtc: request.endUtc, maxEvaluations: request.maxEvaluations });
  }
  return { ...request, ...(signal === undefined ? {} : { signal }) };
}

type EventOrder = { readonly uid: string; readonly receipt: { readonly utc: string } };
/** Locale-independent UTC order with UID as the tie breaker. */
export function compareScheduleEvents(a: EventOrder, b: EventOrder): number {
  return a.receipt.utc < b.receipt.utc ? -1 : a.receipt.utc > b.receipt.utc ? 1 :
    a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

/** Snapshot now; perform no search until the consumer pulls. */
export function streamSchedule(input: ScheduleStreamRequest): AsyncGenerator<ScheduleEvent, ScheduleStreamSummary> {
  return run(snapshot(input));
}

async function* run(request: ScheduleStreamRequest): AsyncGenerator<ScheduleEvent, ScheduleStreamSummary> {
  let evaluations = 0, emitted = 0, windows = 0;
  let previous: EventOrder | undefined;
  // Only intervals reaching a later window need persistent duplicate records.
  let active = new Map<string, { endUtc: string; encoded: string }>();
  const endMs = Date.parse(request.endUtc);
  for (let startMs = Date.parse(request.startUtc); startMs < endMs;) {
    const nextMs = Math.min(startMs + request.windowDays * 86_400_000, endMs);
    const window = { startUtc: new Date(startMs).toISOString(), endUtc: new Date(nextMs).toISOString() };
    const fail = (reason: ScheduleStreamFailure, selectionIndex?: number, cause?: unknown): never => {
      throw new ScheduleStreamError(reason, evaluations, emitted, window, selectionIndex,
        cause === undefined ? undefined : { cause });
    };
    const checkpoint = async () => {
      await yieldToHost();
      if (request.signal?.aborted) fail("cancelled");
    };
    const batch: ScheduleEvent[] = [];
    for (const [index, selection] of request.schedules.entries()) {
      await checkpoint();
      if (evaluations === request.maxEvaluations) fail("evaluation-budget", index);
      const result = search(selection, { ...window, maxEvaluations: request.maxEvaluations - evaluations,
        ...(request.signal === undefined ? {} : { signal: request.signal }) });
      evaluations += result.evaluations;
      if (result.status === "refused") fail(result.reason, index, result);
      if (batch.length + result.events.length > request.maxBufferedEvents) fail("buffer-budget", index);
      for (const event of result.events) batch.push(event);
    }
    batch.sort(compareScheduleEvents);
    const seen = new Map<string, string>();
    const retained = new Map<string, { endUtc: string; encoded: string }>();
    for (const [uid, value] of active) if (value.endUtc > window.endUtc) retained.set(uid, value);
    const output: ScheduleEvent[] = [];
    // Validate the entire completed window before releasing any of its records.
    for (const event of batch) {
      const encoded = canonicalJson(event as unknown as JsonValue);
      const duplicate = seen.get(event.uid) ?? active.get(event.uid)?.encoded;
      if (duplicate !== undefined) {
        if (duplicate !== encoded) throw new Error("Conflicting records share a streaming UID.");
        continue;
      }
      if (previous !== undefined && compareScheduleEvents(event, previous) <= 0) {
        throw new Error("A schedule adapter returned an event outside streaming order.");
      }
      if (event.endUtc === undefined ? event.receipt.utc <= window.startUtc || event.receipt.utc > window.endUtc :
          event.receipt.utc >= window.endUtc || event.endUtc <= window.startUtc) {
        throw new Error("A schedule adapter returned an event outside its display window.");
      }
      seen.set(event.uid, encoded);
      if (event.endUtc !== undefined && event.endUtc > window.endUtc) retained.set(event.uid, { endUtc: event.endUtc, encoded });
      if (retained.size > request.maxBufferedEvents) fail("buffer-budget");
      output.push(event);
    }
    windows++;
    for (const event of output) {
      await checkpoint();
      // Capture scalar ordering facts before handing a mutable record to a consumer.
      previous = { uid: event.uid, receipt: { utc: event.receipt.utc } };
      emitted++;
      yield event;
    }
    active = retained;
    startMs = nextMs;
    await checkpoint();
  }
  return { status: "complete", evaluations, emitted, windows };
}

export interface CalendarStreamOptions extends CalendarOptions {
  readonly signal?: AbortSignal;
}

/**
 * Pull one ordered record at a time and reuse the collected serializer's wire
 * format. Source must supply globally unique UIDs; no range-wide UID set is kept.
 * Refusal, invalid data, cancellation or empty input never produces a footer.
 */
export async function* streamCalendar(
  events: AsyncIterable<ScheduleEvent> | Iterable<ScheduleEvent>, options: CalendarStreamOptions
): AsyncGenerator<string, void> {
  const captured = { ...options };
  if (captured.signal !== undefined && !(captured.signal instanceof AbortSignal)) throw new TypeError("signal must be an AbortSignal.");
  captured.signal?.throwIfAborted();
  const header = calendarHeader(captured);
  let previous: EventOrder | undefined;
  for await (const event of events) {
    captured.signal?.throwIfAborted();
    if (previous !== undefined && compareScheduleEvents(event, previous) <= 0) {
      throw new RangeError("Streaming calendar events must be ordered by UTC and distinct UID.");
    }
    const encoded = calendarEvent(event, captured);
    const first = previous === undefined;
    previous = { uid: event.uid, receipt: { utc: event.receipt.utc } };
    if (first) yield header;
    captured.signal?.throwIfAborted();
    yield encoded;
    await yieldToHost();
    captured.signal?.throwIfAborted();
  }
  captured.signal?.throwIfAborted();
  if (previous === undefined) throw new RangeError("A calendar requires at least one event.");
  yield "END:VCALENDAR\r\n";
}
