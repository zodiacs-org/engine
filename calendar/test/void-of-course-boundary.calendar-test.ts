import { afterEach, describe, expect, it, vi } from "vitest";
import { calc } from "../../src/calc.js";
import * as calculations from "../../src/calc.js";
import { EngineAdapter } from "../.cache/events-source/events/src/engine.js";
import type { EvaluationContext } from "../.cache/events-source/events/src/context.js";
import { searchVoidOfCourseSchedule } from "../src/index.js";
import type { VoidOfCourseScheduleRequest } from "../src/index.js";

const DAY_MS = 86_400_000;
const epoch = Date.parse("2026-02-01T00:00:00.000Z");
const instant = (days: number) => new Date(epoch + days * DAY_MS).toISOString();
const request: VoidOfCourseScheduleRequest = {
  namespace: "synthetic-void-boundaries.calendar.invalid", clock: "utc",
  startUtc: instant(0), endUtc: instant(1), stepMs: DAY_MS / 16, maxEvaluations: 100_000,
  policy: { bodies: ["Sun"], aspects: [{ id: "conjunction", angleDegrees: 0 }] }
};

// Analytic invented motion exercises the real upstream interval search. Real
// boundary calc receipts test the interface only, not astronomical accuracy.
function motion(moon: (days: number) => number = days => 30 * days,
  other: (days: number, body: string) => number = () => 15,
  onSample?: (context: EvaluationContext) => void) {
  const reference = calc({ body: "Moon", time: instant(0) });
  if (reference.status !== "ok") throw new Error("Synthetic test reference was refused.");
  return vi.spyOn(EngineAdapter.prototype, "sample").mockImplementation(function (this: EngineAdapter, body, atMs) {
    return this.context.evaluate(() => {
      onSample?.(this.context);
      const days = (atMs - epoch) / DAY_MS;
      return { longitude: ((body === "Moon" ? moon(days) : other(days, body)) % 360 + 360) % 360,
        atMs, speedDegreesPerDay: null, instant: reference.receipt.instants[0]! };
    });
  });
}

afterEach(() => vi.restoreAllMocks());

describe("full void-of-course intervals and stable exit identities", () => {
  it("retains the last exact contact and exclusive midnight sign exit", () => {
    motion();
    const result = searchVoidOfCourseSchedule(request);
    expect(result.status).toBe("complete");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.receipt.utc).toBe(instant(0.5));
    expect(event.endUtc).toBe(instant(1));
    expect(event.summary).toBe("Void-of-course Moon in Aries");
    expect(event.receipt.aspect).toBeNull();
    expect(event.receipt.orbDegrees).toBeNull();
    expect(event.receipt.source!.boundaries).toEqual({ startUtc: instant(0.5), endUtc: instant(1),
      startKind: "last-exact-contact", endKind: "sign-exit", endExclusive: true, clipped: false });
    expect(event.receipt.source!.lastContactOrbDegrees).toBe(0);
    expect(event.identity?.occurrence).toEqual({ scheme: "source-key/1", key: `moon-sign-exit/1:${instant(0)}:0` });
    expect(searchVoidOfCourseSchedule({ ...request, startUtc: instant(0.75), endUtc: instant(0.9) }).events).toEqual(result.events);
    expect(searchVoidOfCourseSchedule({ ...request, endUtc: instant(0.5) }).events).toEqual([]);
    expect(searchVoidOfCourseSchedule({ ...request, startUtc: instant(1), endUtc: instant(1.1) }).events
      .some(row => row.uid === event.uid)).toBe(false);
  });

  it("starts at sign entry when the policy has no exact contact during that sign", () => {
    motion(undefined, () => 0);
    const result = searchVoidOfCourseSchedule({ ...request,
      policy: { bodies: ["Sun"], aspects: [{ id: "square", angleDegrees: 90 }] } });
    expect(result.status).toBe("complete");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.receipt.utc).toBe(instant(0));
    expect(result.events[0]?.endUtc).toBe(instant(1));
    expect(result.events[0]?.receipt.source!.boundaries).toMatchObject({ startKind: "sign-entry" });
    expect(result.events[0]?.receipt.source!.event).toMatchObject({ lastContact: null, clippedStart: false });
    expect(result.events[0]?.receipt.source!.lastContactOrbDegrees).toBeNull();
  });

  it("uses the latest policy contact with deterministic ties and ignores contacts at sign exit", () => {
    motion(undefined, (_days, body) => body === "Sun" ? 15 : 22.5);
    const policy = { bodies: ["Venus", "Sun", "Mars"] as const,
      aspects: [{ id: "custom", angleDegrees: 0 }] };
    const result = searchVoidOfCourseSchedule({ ...request, policy });
    expect(result.status).toBe("complete");
    expect(result.events[0]?.receipt.utc).toBe(instant(0.75));
    expect(result.events[0]?.receipt.bodies).toEqual(["Moon", "Mars", "Sun", "Venus"]);
    expect(result.events[0]?.receipt.source!.event).toMatchObject({ lastContact: { target: { body: "Venus" } } });
    const reordered = searchVoidOfCourseSchedule({ ...request,
      policy: { bodies: ["Mars", "Sun", "Venus"], aspects: [{ id: "renamed", angleDegrees: 0 }] } });
    expect(reordered.events[0]?.uid).toBe(result.events[0]?.uid);
    expect(reordered.events[0]?.identity).toEqual(result.events[0]?.identity);
    vi.restoreAllMocks();
    motion(undefined, () => 30);
    const exitContact = searchVoidOfCourseSchedule(request);
    expect(exitContact.events[0]?.receipt.utc).toBe(instant(0));
    expect(exitContact.events[0]?.endUtc).toBe(instant(1));
    expect(exitContact.events[0]?.receipt.source!.event).toMatchObject({ lastContact: null });
  });

  it("preserves identities and receipts across regeneration, overlap and interval partitions", () => {
    motion();
    const whole = searchVoidOfCourseSchedule({ ...request, endUtc: instant(3) });
    expect(whole.status).toBe("complete");
    expect(whole.events).toHaveLength(3);
    expect(searchVoidOfCourseSchedule({ ...request, endUtc: instant(3) }).events).toEqual(whole.events);
    for (const split of [0.5, 0.75, 1, 1.5, 2]) {
      const left = searchVoidOfCourseSchedule({ ...request, endUtc: instant(split) });
      const right = searchVoidOfCourseSchedule({ ...request, startUtc: instant(split), endUtc: instant(3) });
      expect(left.status).toBe("complete");
      expect(right.status).toBe("complete");
      const joined = [...new Map([...left.events, ...right.events].map(event => [event.uid, event])).values()];
      expect(joined).toEqual(whole.events);
    }
    const overlap = searchVoidOfCourseSchedule({ ...request, startUtc: instant(0.75), endUtc: instant(2.5) });
    expect(overlap.events).toEqual(whole.events);
    expect(searchVoidOfCourseSchedule({ ...request, namespace: "different.calendar.invalid" }).events[0]?.uid)
      .not.toBe(whole.events[0]?.uid);
    expect(searchVoidOfCourseSchedule({ ...request, stepMs: DAY_MS / 8 }).events[0]?.uid).not.toBe(whole.events[0]?.uid);
    expect(searchVoidOfCourseSchedule({ ...request, policy: { bodies: ["Venus"], aspects: request.policy.aspects } })
      .events[0]?.uid).not.toBe(whole.events[0]?.uid);
  });

  it("never exports an unresolved tail as an empty completed schedule", () => {
    motion(days => 10 + days, () => 100);
    const result = searchVoidOfCourseSchedule(request);
    expect(result).toMatchObject({ status: "refused", reason: "unresolved-interval", events: [],
      unresolved: [{ reason: "next-ingress-outside-window", startUtc: instant(-4), endUtc: instant(5), sign: "Aries" }] });
    expect(result.evaluations).toBeGreaterThan(0);
  });

  it("keeps distinct occurrence keys for repeated exits from the same sign within a day", () => {
    motion(days => 720 * days);
    const whole = searchVoidOfCourseSchedule(request);
    expect(whole.status).toBe("complete");
    const aries = whole.events.filter(event => event.summary.endsWith("Aries"));
    expect(aries).toHaveLength(2);
    expect(aries.map(event => event.identity?.occurrence)).toEqual([
      { scheme: "source-key/1", key: `moon-sign-exit/1:${instant(0)}:0` },
      { scheme: "source-key/1", key: `moon-sign-exit/1:${instant(0)}:1` }
    ]);
    const narrow = searchVoidOfCourseSchedule({ ...request, startUtc: instant(0.5) });
    expect(narrow.events.filter(event => event.summary.endsWith("Aries"))).toEqual([aries[1]]);
  });

  it("refuses a relevant clipped start, even when its exit is resolved", () => {
    // Aries began ten days earlier; it exits during the requested day.
    motion(days => 28.5 + days * 3, () => 200);
    const result = searchVoidOfCourseSchedule({ ...request, endUtc: instant(0.5) });
    expect(result).toMatchObject({ status: "refused", reason: "unresolved-interval", events: [],
      unresolved: [{ reason: "interval-start-outside-window", startUtc: instant(-4), endUtc: instant(0.5), sign: "Aries" }] });
  });
});

describe("void-of-course work controls", () => {
  it("charges all scans and boundary and last-contact target receipts to one budget", () => {
    const sample = motion();
    const done = searchVoidOfCourseSchedule(request);
    expect(done.status).toBe("complete");
    expect(done.evaluations).toBe(sample.mock.calls.length + 3);
    for (const maxEvaluations of [1, done.evaluations - 1]) {
      expect(searchVoidOfCourseSchedule({ ...request, maxEvaluations })).toEqual({
        status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
      });
    }
    expect(searchVoidOfCourseSchedule({ ...request, maxEvaluations: done.evaluations })).toEqual(done);
  });

  it("refuses during boundary or target receipt creation without returning an interval", () => {
    let firstScanSamples = 0;
    motion(undefined, undefined, context => {
      if (context.window.startMs === epoch - 4 * DAY_MS) firstScanSamples++;
    });
    expect(searchVoidOfCourseSchedule(request).status).toBe("complete");
    const scanCost = firstScanSamples;
    for (const extra of [0, 1, 2]) {
      const maxEvaluations = scanCost + extra;
      expect(searchVoidOfCourseSchedule({ ...request, maxEvaluations })).toEqual({
        status: "refused", reason: "evaluation-budget", events: [], evaluations: maxEvaluations
      });
    }
  });

  it("discards earlier resolved intervals when a later displayed segment is unresolved", () => {
    motion(days => days <= 1 ? 30 * days : 30 + days - 1);
    const receipts = vi.spyOn(calculations, "calc");
    const result = searchVoidOfCourseSchedule({ ...request, endUtc: instant(2) });
    expect(receipts).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: "refused", reason: "unresolved-interval", events: [],
      unresolved: [{ reason: "next-ingress-outside-window", sign: "Taurus" }] });
  });

  it("refuses without partial results on cancellation before work or later", () => {
    const sample = motion();
    expect(searchVoidOfCourseSchedule({ ...request, signal: AbortSignal.abort() })).toEqual({
      status: "refused", reason: "cancelled", events: [], evaluations: 0
    });
    expect(sample).not.toHaveBeenCalled();
    sample.mockRestore();
    const controller = new AbortController();
    motion(undefined, undefined, context => { if (context.window.startMs >= epoch - 3 * DAY_MS) controller.abort(); });
    const cancelled = searchVoidOfCourseSchedule({ ...request, signal: controller.signal });
    expect(cancelled).toMatchObject({ status: "refused", reason: "cancelled", events: [] });
    expect(cancelled.evaluations).toBeGreaterThan(1);
  });

  it("propagates engine refusal and cancellation during receipt calculation", () => {
    motion();
    const controller = new AbortController();
    const realCalc = calculations.calc;
    vi.spyOn(calculations, "calc").mockImplementationOnce(input => {
      const result = realCalc(input);
      controller.abort();
      return result;
    });
    expect(searchVoidOfCourseSchedule({ ...request, signal: controller.signal }))
      .toMatchObject({ status: "refused", reason: "cancelled", events: [] });
    vi.restoreAllMocks();
    motion();
    vi.spyOn(calculations, "calc").mockReturnValueOnce(realCalc({ body: "Moon", time: "1700-01-01T00:00:00.000Z" }));
    expect(searchVoidOfCourseSchedule(request)).toMatchObject({ status: "refused", reason: "engine-refused", events: [] });
  });

  it("propagates unexpected computation errors and retrograde Moon rejection", () => {
    motion(() => { throw new Error("Synthetic failure"); });
    expect(() => searchVoidOfCourseSchedule(request)).toThrow("Synthetic failure");
    vi.restoreAllMocks();
    motion(days => -30 * days);
    expect(() => searchVoidOfCourseSchedule(request)).toThrow("direct Moon sign motion");
  });
});

describe("void-of-course input validation before work", () => {
  it.each([
    { clock: "tt" }, { clock: "ut1" }, { clock: undefined }, { namespace: "" }, { surprise: true },
    { startUtc: instant(1) }, { startUtc: instant(2) }, { startUtc: "2026-02-30T00:00:00.000Z" },
    { startUtc: "2026-02-01T00:00:00Z" }, { endUtc: "9999-12-31T23:59:59.999Z" },
    { startUtc: "0000-01-01T00:00:00.000Z" },
    { stepMs: 0 }, { stepMs: 7 }, { stepMs: 0.5 }, { stepMs: Infinity },
    { maxEvaluations: 0 }, { maxEvaluations: Infinity }, { maxEvaluations: 1.5 }, { signal: {} },
    { policy: null }, { policy: {} }, { policy: { bodies: [], aspects: request.policy.aspects } },
    { policy: { bodies: ["Moon"], aspects: request.policy.aspects } },
    { policy: { bodies: ["Earth"], aspects: request.policy.aspects } },
    { policy: { bodies: ["Sun", "Sun"], aspects: request.policy.aspects } },
    { policy: { bodies: ["Sun"], aspects: [] } },
    { policy: { ...request.policy, orb: 1 } },
    { policy: { bodies: ["Sun"], aspects: [{ id: "bad", angleDegrees: 181 }] } },
    { policy: { bodies: ["Sun"], aspects: [{ id: "a", angleDegrees: 0 }, { id: "b", angleDegrees: 0 }] } }
  ])("rejects invalid settings: %j", invalid => {
    const sample = motion();
    expect(() => searchVoidOfCourseSchedule({ ...request, ...invalid } as VoidOfCourseScheduleRequest)).toThrow();
    expect(sample).not.toHaveBeenCalled();
  });
});
