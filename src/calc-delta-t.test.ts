// A clock time past the IERS predictions: its TT is the clock time plus a ΔT
// the model extrapolates (src/deltat.ts), which no arbiter checks. calc()
// flags it and widens its bounds by how far the result moves while TT moves by
// its band; natalChart() and chart() flag it; natal receipts carry the flag.
// TT input, a pinned ΔT and an instant inside the IERS table are untouched.
// Synthetic instants and places only.
import { describe, expect, it } from "vitest";

import { natalChart, transits } from "./api.js";
import { MEASURED, SWEPT_BASIS } from "./calc-bounds.js";
import { chart, calc } from "./calc.js";
import type { CalcPosition } from "./calc.js";
import { natalConventionIds } from "./conventions.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "./receipt.js";

const FLAG = "delta-t-extrapolated";
const FAR = "2199-06-15T12:00:00Z";
const NOW = "2024-06-15T12:00:00Z";
const ok = (result: ReturnType<typeof calc>): CalcPosition => {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
};
const [POSITION, DISTANCE, SPEED] = MEASURED["geocentric/apparent"]!["Moon"]!;

/** The ids the edited fields name, so that only the rule under test can refuse the record. */
function withOwnIds(envelope: any): void {
  if (Array.isArray(envelope?.receipt?.conventionIds)) envelope.receipt.conventionIds = natalConventionIds(envelope);
}

describe("calc() at a clock time past the IERS predictions", () => {
  it("flags the Moon at 2199-06-15T12:00Z given on UTC, and widens its bounds by its rate times the TT band", () => {
    const moon = ok(calc({ body: "Moon", time: FAR }));
    const [used] = moon.receipt.instants;
    expect(used!.deltaT.segment).toBe("extrapolated");
    expect(used!.deltaT.sigma!).toBeGreaterThan(100);
    expect(moon.flags).toEqual([FLAG]);
    // The rate of the direction from the result's own speeds, degrees a day, as an independent check of the samples.
    const cos = Math.cos((moon.lat * Math.PI) / 180);
    const omega = Math.hypot(moon.speeds!.lon * cos, moon.speeds!.lat);
    const tt = moon.band!.time.tt;
    expect(tt).toBeCloseTo(Math.hypot(0.9, used!.deltaT.sigma!), 9);
    const extra = (omega / 24) * tt;
    // The Moon moves about 0.55″ a second of time, and the band is about 103 s.
    expect(extra).toBeGreaterThan(50);
    expect(extra).toBeLessThan(65);
    const { position, distance, speed } = moon.bounds;
    expect(position.label).toBe("estimated");
    expect(position.unit).toBe("arcsec");
    expect(Math.abs(position.value! - POSITION! - extra)).toBeLessThan(0.01 * extra);
    expect(position.basis.startsWith(`${SWEPT_BASIS}; plus `)).toBe(true);
    expect(position.basis).toContain("ΔT extrapolated");
    expect(distance!.label).toBe("estimated");
    expect(distance!.value!).toBeGreaterThan(DISTANCE!);
    expect(speed!.label).toBe("estimated");
    expect(speed!.value!).toBeGreaterThan(SPEED!);
    // The receipt names the rule, before the band's, which stays last.
    expect(moon.receipt.conventions).toContain("bounds:plus-delta-t-band");
    expect(moon.receipt.conventions.at(-1)).toBe("time-band:first-order");
  });

  it("widens the position bound without speeds too, and flags UT1 input", () => {
    const bare = ok(calc({ body: "Moon", time: FAR, flags: { speeds: false } }));
    expect(bare.flags).toEqual([FLAG]);
    expect(bare.bounds.position.value).toBe(ok(calc({ body: "Moon", time: FAR })).bounds.position.value);
    expect(bare.bounds.speed).toBeNull();
    const ut1 = ok(calc({ body: "Moon", time: { jd: 2_524_183.0, scale: "ut1" } }));
    expect(ut1.flags).toEqual([FLAG]);
    expect(ut1.bounds.position.label).toBe("estimated");
  });

  it("leaves a present-day UTC instant, TT input and a pinned ΔT alone", () => {
    const now = ok(calc({ body: "Moon", time: NOW }));
    const onTt = ok(calc({ body: "Moon", time: { jd: ok(calc({ body: "Moon", time: FAR })).receipt.instants[0]!.jdTt, scale: "tt" } }));
    const pinned = ok(calc({ body: "Moon", time: { iso: FAR, deltaT: 125 } }));
    for (const result of [now, onTt, pinned]) {
      expect(result.flags).toEqual([]);
      expect(result.bounds.position).toEqual({ value: POSITION, unit: "arcsec", label: "measured", basis: SWEPT_BASIS });
      expect(result.bounds.distance!.value).toBe(DISTANCE);
      expect(result.bounds.speed).toMatchObject({ value: SPEED, label: "measured" });
      expect(result.receipt.conventions).not.toContain("bounds:plus-delta-t-band");
    }
    expect(onTt.receipt.instants[0]!.deltaT.segment).toBe("extrapolated");
  });

  it("keeps a widened topocentric bound at or above the geocentric widening", () => {
    const place = { topocentric: { latitude: -33.5, longitude: 151.25 } };
    const topocentric = ok(calc({ body: "Moon", time: FAR, center: place }));
    const geocentric = ok(calc({ body: "Moon", time: FAR }));
    expect(topocentric.flags).toEqual([FLAG]);
    expect(topocentric.bounds.position.value!).toBeGreaterThanOrEqual(geocentric.bounds.position.value!);
  });
});

describe("natalChart() and chart() at a clock time past the IERS predictions", () => {
  const birth = (utc: string, extra: object = {}) => ({ utc, latitude: 41.5, longitude: 12.25, houseSystem: "placidus" as const, ...extra });

  it("flag a UTC instant there, and neither a present-day one nor TT input", () => {
    expect(natalChart(birth(FAR)).flags).toEqual([FLAG]);
    expect(natalChart(birth(NOW)).flags).toEqual([]);
    expect(natalChart(birth(FAR, { timeScale: "tt" })).flags).toEqual([]);
    expect(natalChart(birth(FAR, { deltaT: 125 })).flags).toEqual([]);
    expect(natalChart(birth(FAR, { timeScale: "ut1" })).flags).toEqual([FLAG]);
  });

  it("accept the flag as an echo only where the calculation derives it", () => {
    expect(natalChart(birth(FAR, { flags: [FLAG] })).flags).toEqual([FLAG]);
    expect(() => natalChart(birth(NOW, { flags: [FLAG] }))).toThrow(RangeError);
    expect(() => natalChart(birth(FAR, { timeScale: "tt", flags: [FLAG] }))).toThrow(RangeError);
    const result = chart({ time: FAR, place: { latitude: 41.5, longitude: 12.25 }, timeFlags: [FLAG] });
    if (result.status !== "ok") throw new Error(result.reason);
    expect(result.chart.flags).toEqual([FLAG]);
    expect(() => chart({ time: NOW, timeFlags: [FLAG] })).toThrow(RangeError);
  });

  it("take a supplied chart from before the flag and add it, and refuse the flag where it does not belong", () => {
    const far = natalChart(birth(FAR));
    expect(() => transits({ ...far, flags: [] }, "2199-06-16T00:00:00Z")).not.toThrow();
    const now = natalChart(birth(NOW));
    expect(() => transits({ ...now, flags: [FLAG] }, "2024-06-16T00:00:00Z")).toThrow(RangeError);
  });

  it("carry the flag through a natal receipt, which allows it only where the record's ΔT and scale show it", () => {
    const json = serializeNatalEnvelope(createNatalEnvelope(natalChart(birth(FAR))));
    const parsed = parseNatalEnvelope(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.receipt.resultFlags).toEqual([FLAG]);
    // A record written before the flag existed stays readable.
    const before = JSON.parse(json);
    before.receipt.resultFlags = [];
    withOwnIds(before);
    expect(parseNatalEnvelope(JSON.stringify(before)).ok).toBe(true);
    const inside = JSON.parse(serializeNatalEnvelope(createNatalEnvelope(natalChart(birth(NOW)))));
    inside.receipt.resultFlags = [FLAG];
    withOwnIds(inside);
    expect(parseNatalEnvelope(JSON.stringify(inside))).toMatchObject({ ok: false, code: "inconsistent_result" });
  });
});
