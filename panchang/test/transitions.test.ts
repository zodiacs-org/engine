import { afterEach, describe, expect, it, vi } from "vitest";
import * as limbs from "../src/limbs.js";
import * as crossings from "../../src/crossings.js";
import { nakshatraOf } from "../../src/vedic/nakshatra.js";
import { declareSiderealLongitude } from "../../src/vedic/sidereal.js";
import {
  LIMB_KINDS, TRANSITION_CONVENTIONS, luminarySnapshot, resolveSunriseDay, searchLimbTransitions
} from "../src/index.js";
import type { LimbKind, LimbTransitions, TransitionOptions, TransitionResult } from "../src/index.js";
import { limbIndex } from "../src/transitions.js";

const EPOCH = Date.parse("2024-03-20T00:00:00Z");
const UNIT = 2 ** 26;
const DAY = 86_400_000;
const iso = (offset: number) => new Date(EPOCH + offset).toISOString();
function ok(result: TransitionResult): LimbTransitions {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}
function refused(result: TransitionResult, reason: string): void {
  expect(result).toMatchObject({ status: "refused", reason });
  for (const key of ["startState", "transitions", "intervals"]) expect(result).not.toHaveProperty(key);
}
afterEach(() => vi.restoreAllMocks());

// Independently prescribed linear coordinates, unrelated to the ephemeris:
// Sun=t/U, Moon=13t/U degrees, U=2^26 ms. Binary coordinates are dyadic.
// The seed supplies test-only receipt shapes. These mock snapshots are not
// published ephemeris outputs and their copied receipts certify no positions.
function analyticalSource(direction = 1, freezeYoga = false): void {
  const seed = luminarySnapshot(iso(0));
  if (seed.status !== "ok") throw new Error("Expected seed coverage");
  const wrap = (angle: number) => ((angle % 360) + 360) % 360;
  vi.spyOn(limbs, "instantaneousPanchang").mockImplementation((at) => {
    const utc = (at as Date).toISOString();
    const t = direction * ((at as Date).getTime() - EPOCH) / UNIT;
    const sun = wrap(t);
    const moon = wrap(13 * t);
    const a = declareSiderealLongitude(freezeYoga ? 0 : sun, { ayanamsa: "lahiri", at: utc });
    const b = declareSiderealLongitude(freezeYoga ? 0 : moon, { ayanamsa: "lahiri", at: utc });
    return {
      ...seed, utc,
      sun: { tropical: { ...seed.sun.tropical, lon: sun }, sidereal: { ...seed.sun.sidereal, lon: a.lon } },
      moon: { tropical: { ...seed.moon.tropical, lon: moon }, sidereal: { ...seed.moon.sidereal, lon: b.lon } },
      nakshatra: nakshatraOf(b), tithi: limbs.tithiOf(sun, moon), karana: limbs.karanaOf(sun, moon),
      yoga: limbs.yogaOf(a, b)
    };
  });
}

// Expected times are rational multiples of U, solved by hand. Rounding is
// ceiling because the new sector owns the boundary at whole milliseconds.
const period: Record<LimbKind, readonly [bigint, bigint]> = {
  tithi: [BigInt(UNIT), 1n], karana: [BigInt(UNIT), 2n],
  nakshatra: [40n * BigInt(UNIT), 39n], pada: [10n * BigInt(UNIT), 39n],
  yoga: [20n * BigInt(UNIT), 21n]
};
function root(kind: LimbKind, multiple: number): number {
  const [numerator, denominator] = period[kind];
  const value = BigInt(multiple) * numerator;
  return Number(value >= 0n ? (value + denominator - 1n) / denominator : value / denominator);
}
const compare = (a: { at: string; kind: LimbKind }, b: { at: string; kind: LimbKind }) =>
  Date.parse(a.at) - Date.parse(b.at) || LIMB_KINDS.indexOf(a.kind) - LIMB_KINDS.indexOf(b.kind);

describe("independent analytical crossing instants (SOURCES.md)", () => {
  it.each([[0, UNIT], [12345, DAY], [-DAY, 1], [DAY, 2 * DAY]])(
    "finds every rationally derived transition in [%i,%i)", (from, to) => {
      analyticalSource();
      const solver = vi.spyOn(crossings, "searchLongitudeCrossingsWith");
      const result = ok(searchLimbTransitions(iso(from), iso(to)));
      const expected: { kind: LimbKind; at: string }[] = [];
      for (const kind of LIMB_KINDS) {
        for (let k = -30; k <= 30; k++) {
          const ms = root(kind, k);
          if (ms >= from && ms < to) expected.push({ kind, at: iso(ms) });
        }
      }
      expected.sort(compare);
      expect(result.transitions.map(({ kind, at }) => ({ kind, at }))).toEqual(expected);
      expect(solver.mock.calls.map((call) => call[1])).toEqual(["karana", "pada", "yoga"]);
      for (const call of solver.mock.calls) expect(call[5]).toEqual({ stepDays: 1 / 96 });
      expect(result.conventions).toBe(TRANSITION_CONVENTIONS);
      expect(result.maxSamples).toBe(10_000);
      expect(result.samples).toBeLessThanOrEqual(result.maxSamples);
      expect(result.searchFrom).toBe(iso(from - 3 * DAY));
      expect(result.searchTo).toBe(iso(to + 3 * DAY));
      for (const event of result.transitions) {
        expect(Date.parse(event.before.utc)).toBe(Date.parse(event.at) - 1);
        expect(event.after.utc).toBe(event.at);
        expect(limbIndex(event.before, event.kind)).not.toBe(limbIndex(event.after, event.kind));
      }
    }
  );

  it("retains full intervals and their true rational endpoints beyond clipping", () => {
    analyticalSource();
    const result = ok(searchLimbTransitions(iso(1), iso(UNIT - 1)));
    for (const kind of LIMB_KINDS) {
      const intervals = result.intervals.filter((interval) => interval.kind === kind);
      expect(intervals[0]!.start.at).toBe(iso(0));
      let k = 0;
      for (const interval of intervals) {
        expect(interval.start.at).toBe(iso(root(kind, k)));
        expect(interval.end.at).toBe(iso(root(kind, ++k)));
        expect(interval.index).toBe(limbIndex(interval.start.after, kind));
      }
      expect(Date.parse(intervals.at(-1)!.end.at)).toBeGreaterThanOrEqual(EPOCH + UNIT - 1);
    }
    expect(result.intervals.map(({ start }) => start)).toEqual(
      result.intervals.map(({ start }) => start).sort(compare));
    const tithi = result.intervals.find((interval) => interval.kind === "tithi")!;
    expect(tithi.start.at).toBe(iso(0));
    expect(tithi.end.at).toBe(iso(UNIT));
  });

  it("includes start changes, excludes end changes and joins adjacent windows exactly", () => {
    analyticalSource();
    const first = ok(searchLimbTransitions(iso(-UNIT), iso(0)));
    const second = ok(searchLimbTransitions(iso(0), iso(UNIT)));
    expect(first.transitions.every((event) => event.at < iso(0))).toBe(true);
    expect(second.transitions.filter((event) => event.at === iso(0)).map((event) => event.kind)).toEqual(LIMB_KINDS);
    for (const kind of LIMB_KINDS) {
      const a = first.intervals.filter((interval) => interval.kind === kind).at(-1)!;
      const b = second.intervals.find((interval) => interval.kind === kind)!;
      expect(a.end).toEqual(b.start);
      expect(limbIndex(second.startState, kind)).toBe(0);
    }
    const conjunction = second.transitions.filter((event) => event.at === iso(0));
    expect(conjunction.find((event) => event.kind === "karana")!.before.karana.name).toBe("Naga");
    expect(conjunction.find((event) => event.kind === "karana")!.after.karana.name).toBe("Kimstughna");
    expect(conjunction.find((event) => event.kind === "tithi")!.before.tithi.paksha).toBe("krishna");
    expect(conjunction.find((event) => event.kind === "tithi")!.after.tithi.paksha).toBe("shukla");
  });

  it("returns complete containing intervals even when no change is inside a tiny window", () => {
    analyticalSource();
    const result = ok(searchLimbTransitions(iso(12345), iso(12346)));
    expect(result.transitions).toEqual([]);
    expect(result.intervals).toHaveLength(LIMB_KINDS.length);
  });

  it("reports the fixed karanas in order across the conjunction", () => {
    analyticalSource();
    const result = ok(searchLimbTransitions(iso(-3 * UNIT / 2), iso(UNIT / 2 + 1)));
    expect(result.transitions.filter((event) => event.kind === "karana").map((event) =>
      [event.at, event.after.karana.name])).toEqual([
      [iso(-3 * UNIT / 2), "Shakuni"], [iso(-UNIT), "Chatushpada"],
      [iso(-UNIT / 2), "Naga"], [iso(0), "Kimstughna"], [iso(UNIT / 2), "Bava"]
    ]);
  });

  it("accepts the maximum elapsed window and an explicit unlimited snapshot budget", () => {
    analyticalSource();
    const result = ok(searchLimbTransitions(iso(0), iso(2 * DAY), { maxSamples: Infinity }));
    expect(result.maxSamples).toBe(Infinity);
    expect(Date.parse(result.to) - Date.parse(result.from)).toBe(2 * DAY);
  });
});

describe("bounded searches and whole-result refusals", () => {
  it("shares a unique-snapshot budget across solver streams and millisecond checks", () => {
    analyticalSource();
    const full = ok(searchLimbTransitions(iso(0), iso(DAY)));
    const requests = vi.mocked(limbs.instantaneousPanchang).mock.calls.map(([at]) => (at as Date).getTime());
    expect(new Set(requests).size).toBe(full.samples);
    expect(requests.length).toBe(full.samples);
    vi.mocked(limbs.instantaneousPanchang).mockClear();
    const limited = searchLimbTransitions(iso(0), iso(DAY), { maxSamples: full.samples - 1 });
    refused(limited, "sample-budget");
    expect(limited.samples).toBe(full.samples - 1);
    expect(limbs.instantaneousPanchang).toHaveBeenCalledTimes(full.samples - 1);
    expect(ok(searchLimbTransitions(iso(0), iso(DAY), { maxSamples: full.samples })).samples).toBe(full.samples);
  });

  it("refuses before the second snapshot when its budget is spent", () => {
    const result = searchLimbTransitions(iso(0), iso(DAY), { maxSamples: 1 });
    refused(result, "sample-budget");
    expect(result.samples).toBe(1);
    expect(result.longitudeSamples).toBe(0);
  });

  it.each(["1800-01-02", "2199-12-29"]) ("preserves padded-coverage refusals near %s", (date) => {
    const result = searchLimbTransitions(date, new Date(Date.parse(date) + DAY));
    refused(result, "engine-refused");
    if (result.status === "refused") expect(result.engine?.engine.status).toBe("refused");
  });

  it("preserves an engine refusal encountered in the middle of a scan", () => {
    analyticalSource();
    const original = vi.mocked(limbs.instantaneousPanchang).getMockImplementation()!;
    const refusal = luminarySnapshot("1750-01-01");
    if (refusal.status !== "refused") throw new Error("Expected refusal");
    vi.mocked(limbs.instantaneousPanchang).mockImplementation((at, options) =>
      (at as Date).getTime() === EPOCH - 2 * DAY ? refusal : original(at, options));
    const result = searchLimbTransitions(iso(0), iso(DAY));
    refused(result, "engine-refused");
    if (result.status === "refused") expect(result.engine).toBe(refusal);
  });

  it.each(["1940-12-31", "1972-01-01", "2017-01-01", "2027-10-02"])(
    "refuses an expanded search spanning a discontinuity near %s", (date) => {
      const result = searchLimbTransitions(date, new Date(Date.parse(date) + DAY));
      refused(result, "time-basis-discontinuity");
      expect(result.longitudeSamples).toBe(0);
    });

  it("refuses unsupported backwards crossings", () => {
    analyticalSource(-1);
    refused(searchLimbTransitions(iso(0), iso(DAY)), "unresolved-crossing");
  });
  it("refuses when the padded span cannot bracket a limb", () => {
    analyticalSource(1, true);
    refused(searchLimbTransitions(iso(0), iso(DAY)), "unbracketed-limb");
  });
  it("refuses a solver candidate that cannot be confirmed by adjacent classifiers", () => {
    analyticalSource();
    vi.spyOn(crossings, "searchLongitudeCrossingsWith").mockReturnValue({
      status: "complete", samples: 1, crossings: [{ at: new Date(EPOCH + 12345), retrograde: false }]
    });
    refused(searchLimbTransitions(iso(0), iso(DAY)), "unresolved-crossing");
  });
  it("does not convert unexpected calculation errors into refusals", () => {
    const failure = new Error("Synthetic failure");
    vi.spyOn(limbs, "instantaneousPanchang").mockImplementation(() => { throw failure; });
    expect(() => searchLimbTransitions(iso(0), iso(DAY))).toThrow(failure);
  });

  it.each([null, [], { maxSamples: null }, { maxSamples: 0 }, { maxSamples: 2.5 },
    { maxSamples: NaN }, { ayanamsa: null }, { ayanamsa: "unknown" }, { stepDays: 1 }, { paddingDays: 1 }])(
    "rejects invalid options %j", (options) => {
      expect(() => searchLimbTransitions(iso(0), iso(DAY), options as TransitionOptions)).toThrow(RangeError);
    });
  it.each([["2024-02-30", iso(DAY)], [iso(0), iso(0)], [iso(DAY), iso(0)],
    [iso(0), iso(2 * DAY + 1)], ["2024-03-20T12:00", iso(DAY)]])(
    "rejects invalid windows %s to %s", (from, to) => {
      expect(() => searchLimbTransitions(from, to)).toThrow(RangeError);
    });
});

describe("real engine integration, not independent transition accuracy", () => {
  it.each(["lahiri", "raman"] as const)("keeps %s receipts and true boundaries around an invented site's day", (ayanamsa) => {
    const day = resolveSunriseDay({ date: "2024-03-20", timeZone: "Asia/Kolkata",
      observer: { latitude: 12.5, longitude: 75.25 } }, { ayanamsa });
    if (day.status !== "ok") throw new Error(day.reason);
    const from = new Date(day.start.utc);
    const to = new Date(day.end.utc);
    const result = ok(searchLimbTransitions(from, to, { ayanamsa }));
    expect(from.toISOString()).toBe(day.start.utc);
    expect(to.toISOString()).toBe(day.end.utc);
    expect(result.startState).toEqual(limbs.instantaneousPanchang(from, { ayanamsa }));
    expect(result.transitions.length).toBeGreaterThan(0);
    for (const interval of result.intervals) {
      expect(Date.parse(interval.start.at)).toBeLessThan(to.getTime());
      expect(Date.parse(interval.end.at)).toBeGreaterThan(from.getTime());
      for (const event of [interval.start, interval.end]) {
        expect(event.after).toEqual(limbs.instantaneousPanchang(event.at, { ayanamsa }));
        expect(event.before).toEqual(limbs.instantaneousPanchang(new Date(Date.parse(event.at) - 1), { ayanamsa }));
        expect(event.after.ayanamsa.name).toBe(ayanamsa);
        expect(event.after.sun.sidereal.receipt.engine.ephemeris.version).toBe("2.1.19");
      }
    }
  });
});
