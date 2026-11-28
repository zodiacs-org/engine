import { afterEach, describe, expect, it, vi } from "vitest";
import { calc } from "../../src/calc.js";
import type { CalcPosition, CalcRefusal } from "../../src/calc.js";
import { LEAP_SECOND_LIST, UT1_DATA } from "../../src/time-scale.js";
import * as engine from "../src/engine.js";
import { timeSeams } from "../src/time-seams.js";
import { mansionAt, mansionIngresses, mansionRange } from "../src/index.js";
import type { MansionZodiac } from "../src/index.js";

const DAY = 86_400_000;
const TABLE = "equal28-aries-v1";
const ISO = "2001-02-03T00:00:00.000Z";
const MODEL_SEAM = Date.parse("1940-12-31T18:00:00Z");
// Engine time-basis steps, not independently measured astronomical events.
const SEAMS = [MODEL_SEAM,
  ...LEAP_SECOND_LIST.changes.map(([mjd]) => (mjd - 40_587) * DAY),
  (UT1_DATA.to - 40_587) * DAY + 1];
const ZODIACS: readonly MansionZodiac[] = ["tropical", { sidereal: "lahiri" }];
const complete = <T extends { readonly status: "ok" }>(result: T | CalcRefusal): T => {
  if (result.status !== "ok") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
};

// Synthetic motion and receipts test search behavior only. Receipt replay is
// checked separately using actual engine samples; these are no accuracy claim.
function syntheticMotion(longitude: (ms: number) => number) {
  const tropical = complete(engine.tropicalMoon(ISO));
  const sidereal = complete(engine.siderealMoon(ISO, "lahiri"));
  const sample = (template: CalcPosition, time: unknown): CalcPosition => {
    if (!(time instanceof Date)) throw new Error("Expected a UTC Date sample");
    return { ...template, lon: (longitude(time.getTime()) % 360 + 360) % 360,
      receipt: { ...template.receipt,
        request: { ...template.receipt.request, time: { iso: time.toISOString() } },
        instants: [{ ...template.receipt.instants[0]!, utc: time.toISOString() }] } };
  };
  const tropicalSpy = vi.spyOn(engine, "tropicalMoon").mockImplementation((time) => sample(tropical, time));
  const siderealSpy = vi.spyOn(engine, "siderealMoon").mockImplementation((time) => sample(sidereal, time));
  return { tropical: tropicalSpy, sidereal: siderealSpy };
}

afterEach(() => vi.restoreAllMocks());

describe("time-basis seam searches", () => {
  it("finds steps at exact label milliseconds, excludes from, and detects multiple steps", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    for (const seam of SEAMS) {
      expect(timeSeams(seam - 1000, seam + 1000)).toEqual([seam]);
      expect(timeSeams(seam - 1, seam)).toEqual([seam]);
      expect(timeSeams(seam, seam + 1000)).toEqual([]);
      expect(timeSeams(seam, seam)).toEqual([]);
    }
    expect(timeSeams(Date.parse("1971-12-31T23:59:59Z"), Date.parse("1972-12-31T00:00:00Z")))
      .toEqual([Date.parse("1972-01-01T00:00:00Z"), Date.parse("1972-07-01T00:00:00Z")]);
    expect(sample).not.toHaveBeenCalled();
  });

  it.each(ZODIACS)("keeps brief reverse and return changes around the model seam in %j", (zodiac) => {
    // A forward crossing at seam-5, backward jump at seam, then forward at
    // seam+15. All are closer than the shared solver's duplicate threshold.
    const spies = syntheticMotion((ms) => 90 + (ms - MODEL_SEAM + 5 - (ms >= MODEL_SEAM ? 20 : 0)) / 1_000_000);
    const request = { from: new Date(MODEL_SEAM - 1000), to: new Date(MODEL_SEAM + 1000), table: TABLE, zodiac } as const;
    const result = complete(mansionIngresses(request));
    const expected = [-5, 0, 15].map((offset) => new Date(MODEL_SEAM + offset).toISOString());
    expect(result.ingresses.map(({ at }) => at)).toEqual(expected);
    expect(result.ingresses.map(({ direction }) => direction)).toEqual(["direct", "retrograde", "direct"]);
    expect(result.ingresses.map(({ mansion }) => mansion.index)).toEqual([8, 7, 8]);
    expect(result.samples).toBe(spies.tropical.mock.calls.length + spies.sidereal.mock.calls.length);
    const range = complete(mansionRange(request));
    expect(range.intervals.map(({ mansion }) => mansion.index)).toEqual([7, 8, 7, 8]);
    expect(range.intervals.map(({ end }) => end)).toEqual([...expected, request.to.toISOString()]);
    // Cutting at the discontinuity neither loses it nor samples outside.
    const left = complete(mansionIngresses({ ...request, to: new Date(MODEL_SEAM) }));
    const right = complete(mansionIngresses({ ...request, from: new Date(MODEL_SEAM) }));
    expect([...left.ingresses, ...right.ingresses]).toEqual(result.ingresses);
  });

  it("detects adjacent and skipped mansion jumps at every engine time-basis step", () => {
    for (const seam of SEAMS) {
      for (const [before, after, direction] of [[89, 91, "direct"], [91, 89, "retrograde"], [359, 1, "direct"]] as const) {
        const spies = syntheticMotion((ms) => ms < seam ? before : after);
        const request = { from: new Date(seam - 1000), to: new Date(seam + 1000), table: TABLE } as const;
        const result = complete(mansionIngresses(request));
        expect(result.ingresses).toHaveLength(1);
        expect(result.ingresses[0]).toMatchObject({ at: new Date(seam).toISOString(), direction,
          previous: { at: new Date(seam - 1).toISOString() } });
        for (const [time] of spies.tropical.mock.calls) {
          expect((time as Date).getTime()).toBeGreaterThanOrEqual(seam - 1000);
          expect((time as Date).getTime()).toBeLessThanOrEqual(seam + 1000);
        }
        vi.restoreAllMocks();
      }
      syntheticMotion((ms) => ms < seam ? 89 : 110);
      const request = { from: new Date(seam - 1000), to: new Date(seam + 1000), table: TABLE } as const;
      for (const search of [mansionIngresses, mansionRange]) {
        const result = search(request);
        expect(result).toMatchObject({ status: "refused", reason: "unsupported-combination" });
        expect(result).not.toHaveProperty("ingresses");
        expect(result).not.toHaveProperty("intervals");
      }
      vi.restoreAllMocks();
    }
  });

  it("never passes a discontinuity to the smooth solver, even with multiple steps in a window", () => {
    const spies = syntheticMotion(() => 20);
    const solver = engine.searchLongitudeCrossingsWith;
    const search = vi.spyOn(engine, "searchLongitudeCrossingsWith").mockImplementation(
      (longitudeAt, body, target, from, to, options) => {
        const interior = SEAMS.filter((seam) => from.getTime() < seam && seam <= to.getTime());
        expect(interior).toEqual([]);
        return solver(longitudeAt, body, target, from, to, options);
      }
    );
    const result = complete(mansionRange({ from: "1971-12-31T23:59:59Z", to: "1972-12-31", table: TABLE }));
    expect(result.intervals).toHaveLength(1);
    expect(result.samples).toBe(spies.tropical.mock.calls.length);
    expect(search).toHaveBeenCalled();
    const times = spies.tropical.mock.calls.map(([time]) => (time as Date).getTime());
    for (const seam of SEAMS.filter((ms) => Date.parse(result.from) < ms && ms <= Date.parse(result.to))) {
      expect(times).toContain(seam - 1);
      expect(times).toContain(seam);
    }
  });

  it.each(ZODIACS)("replays actual engine receipts on both sides of the time-basis steps in %j", (zodiac) => {
    // Interface/regression checks only, with invented calculation windows.
    for (const seam of SEAMS) {
      const result = complete(mansionRange({ from: new Date(seam - 1), to: new Date(seam + 1), table: TABLE, zodiac }));
      for (const position of result.intervals.flatMap((interval) => [interval.startPosition, interval.endPosition])) {
        expect(mansionAt({ time: position.at, table: TABLE, zodiac })).toMatchObject(position);
        expect(calc(position.receipt.request)).toMatchObject({ status: "ok", lon: position.longitude, receipt: position.receipt });
        expect(calc(position.tropicalReceipt.request)).toMatchObject({ status: "ok", lon: position.tropicalLongitude, receipt: position.tropicalReceipt });
      }
    }
  });
});

describe("adversarial shared budgets and refusals", () => {
  it.each(ZODIACS)("charges every call exactly once across a seam in %j", (zodiac) => {
    const spies = syntheticMotion((ms) => ms < MODEL_SEAM ? 89 : 91);
    const request = { from: new Date(MODEL_SEAM - 1000), to: new Date(MODEL_SEAM + 1000), table: TABLE, zodiac } as const;
    const full = complete(mansionRange(request));
    for (const maxSamples of [1, 2, 3, full.samples - 1, full.samples]) {
      spies.tropical.mockClear();
      spies.sidereal.mockClear();
      const result = mansionRange({ ...request, maxSamples });
      expect(spies.tropical.mock.calls.length + spies.sidereal.mock.calls.length).toBe(maxSamples);
      if (maxSamples === full.samples) expect(result).toEqual({ ...full, maxSamples });
      else {
        expect(result).toMatchObject({ status: "refused", reason: "sample-budget", samples: maxSamples, maxSamples });
        expect(result).not.toHaveProperty("intervals");
        expect(result).not.toHaveProperty("receipts");
      }
    }
    for (const spy of Object.values(spies)) {
      const times = spy.mock.calls.map(([time]) => (time as Date).getTime());
      expect(new Set(times).size).toBe(times.length);
    }
  });

  it("passes an interior sidereal refusal and exception through unchanged, even after earlier ingresses", () => {
    for (const failure of [
      { status: "refused", reason: "unsupported-combination", detail: "Synthetic interior refusal" } as const,
      new RangeError("Synthetic interior engine error")
    ]) {
      for (const search of [mansionIngresses, mansionRange]) {
        vi.restoreAllMocks();
        const spies = syntheticMotion((ms) => 14 * (ms - Date.parse(ISO)) / DAY);
        const original = spies.sidereal.getMockImplementation()!;
        spies.sidereal.mockImplementation((time, ayanamsa) => {
          // The first ingress is already retained when the next boundary's
          // adjacent-millisecond verification requests this sample.
          const secondIngress = Number((180n * BigInt(DAY) + 97n) / 98n);
          if ((time as Date).getTime() === Date.parse(ISO) + secondIngress) {
            if (failure instanceof Error) throw failure;
            return failure;
          }
          return original(time, ayanamsa);
        });
        const request = { from: ISO, to: new Date(Date.parse(ISO) + 3 * DAY), table: TABLE,
          zodiac: { sidereal: "lahiri" } } as const;
        if (failure instanceof Error) expect(() => search(request)).toThrow(failure);
        else expect(search(request)).toBe(failure);
        const firstIngress = Number((90n * BigInt(DAY) + 97n) / 98n);
        expect(spies.sidereal.mock.calls.some(([time]) => (time as Date).getTime() === Date.parse(ISO) + firstIngress)).toBe(true);
      }
    }
  });
});
