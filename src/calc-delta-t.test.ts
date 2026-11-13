// A ΔT the model extrapolates past the IERS table (src/deltat.ts), which no
// arbiter checks: a clock time's TT carries it, and on TT input so does UT1.
// calc(), houses() and events() flag it and widen their bounds by how far the
// result moves while TT and UT1 move by their bands; natalChart() and chart()
// flag it; natal receipts carry the flag, and from engines after 1.1.0-rc.7
// must. A geocentric result on TT input, a pinned ΔT and an instant inside
// the IERS table are untouched. Synthetic instants and places only.
import { describe, expect, it } from "vitest";

import { natalChart, transits } from "./api.js";
import { MEASURED, SWEPT_BASIS } from "./calc-bounds.js";
import { addBounds } from "./calc-ayanamsa.js";
import { chart, calc, events, houses } from "./calc.js";
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

  it("flags a topocentric place on TT input, which turns with UT1, and widens it by the UT1 term alone", () => {
    const jdTt = ok(calc({ body: "Moon", time: FAR })).receipt.instants[0]!.jdTt;
    const site = { topocentric: { latitude: 41.5, longitude: 12.25 } };
    const moon = ok(calc({ body: "Moon", time: { jd: jdTt, scale: "tt" }, center: site }));
    const [used] = moon.receipt.instants;
    const sigma = used!.deltaT.sigma!;
    expect(moon.band!.time).toEqual({ tt: 0, ut1: sigma });
    expect(moon.flags).toEqual([FLAG]);
    expect(moon.receipt.conventions).toContain("bounds:plus-delta-t-band");
    // w σ: the observer's turn, (ω (a + h) / au) / (dist (1 − 10⁻³)) arcseconds a second, times the UT1 band.
    const w = ((7.292115e-5 * 6378.1366) / 149_597_870.7 / (moon.dist! * (1 - 1e-3))) * (180 / Math.PI) * 3600;
    expect(moon.bounds.position.label).toBe("estimated");
    expect(moon.bounds.position.value! - POSITION!).toBeCloseTo(w * sigma, 6);
    expect(moon.bounds.position.basis).toContain("ΔT extrapolated");
    expect(moon.bounds.speed!.value!).toBeGreaterThan(SPEED!);
    // The place itself, moved by UT1 ± σ on the same TT (a pinned ΔT), stays within the widening.
    const [a, b] = [-1, 1].map((k) => ok(calc({ body: "Moon", time: { jd: jdTt, scale: "tt", deltaT: used!.deltaT.seconds + k * sigma }, center: site })));
    const moved = Math.hypot((a!.lon - b!.lon) * Math.cos((moon.lat * Math.PI) / 180), a!.lat - b!.lat) * 3600;
    expect(moved / 2).toBeGreaterThan(0.1 * w * sigma);
    expect(moved / 2).toBeLessThan(w * sigma);
  });
});

describe("houses() and events() on a ΔT extrapolated", () => {
  const place = { latitude: 41.5, longitude: 12.25 };

  it("houses() flags as chart() does, and widens each bound by the largest band it covers", () => {
    const jdTt = ok(calc({ body: "Moon", time: FAR })).receipt.instants[0]!.jdTt;
    for (const time of [FAR, { jd: jdTt, scale: "tt" as const }]) {
      const result = houses({ time, place, houseSystem: "placidus" });
      if (result.status !== "ok") throw new Error(result.reason);
      const given = chart({ time, place, houseSystem: "placidus" });
      if (given.status !== "ok") throw new Error(given.reason);
      expect(result.flags).toEqual([FLAG]);
      expect(given.chart.flags).toEqual([FLAG]);
      const { asc, mc, vertex, eastPoint, cusps } = result.band;
      expect(result.bounds.angles).toMatchObject({ label: "estimated", value: addBounds(0.02, Math.max(asc, mc, vertex, eastPoint)) });
      expect(result.bounds.cusps).toMatchObject({ label: "estimated", value: addBounds(0.08, Math.max(...cusps)) });
      expect(result.receipt.conventions).toContain("bounds:plus-delta-t-band");
    }
    // On TT input the ascendant moves by its rate on UT1 times σ: about 20 arcminutes here.
    const onTt = houses({ time: { jd: jdTt, scale: "tt" }, place, houseSystem: "placidus" });
    if (onTt.status !== "ok") throw new Error(onTt.reason);
    expect(onTt.band.asc / 60).toBeGreaterThan(15);
    expect(onTt.bounds.angles.value!).toBeGreaterThan(onTt.band.asc);
    const now = houses({ time: NOW, place, houseSystem: "placidus" });
    if (now.status !== "ok") throw new Error(now.reason);
    expect(now.flags).toEqual([]);
    expect([now.bounds.angles.value, now.bounds.angles.label, now.bounds.cusps.value]).toEqual([0.02, "measured", 0.08]);
  });

  it("events() flags an event on it, and widens the timing bound by the widest such UTC band", () => {
    const request = { kind: "longitude-crossing", body: "Sun", longitude: 90 } as const;
    const far = events({ ...request, from: "2199-01-01T00:00:00Z", to: "2199-12-31T00:00:00Z" });
    const now = events({ ...request, from: "2024-01-01T00:00:00Z", to: "2024-12-31T00:00:00Z" });
    if (far.status !== "ok" || now.status !== "ok") throw new Error("refused");
    const bracket = (5 * 86_400) / 2 ** 24;
    expect(now.flags).toEqual([]);
    expect(now.bounds.timing).toMatchObject({ value: bracket, label: "estimated" });
    expect(far.flags).toEqual([FLAG]);
    expect(far.events).toHaveLength(1);
    const utc = far.events[0]!.band.utc;
    expect(utc).toBeGreaterThan(100);
    expect(far.bounds.timing.value).toBe(addBounds(bracket, utc));
    expect(far.bounds.timing.basis).toContain("ΔT extrapolated");
    expect(far.receipt.conventions).toContain("bounds:plus-delta-t-band");
  });
});

describe("natalChart() and chart() at a clock time past the IERS predictions", () => {
  const birth = (utc: string, extra: object = {}) => ({ utc, latitude: 41.5, longitude: 12.25, houseSystem: "placidus" as const, ...extra });

  it("flag a UTC instant there and TT input with houses, and neither a present-day one nor TT input without", () => {
    expect(natalChart(birth(FAR)).flags).toEqual([FLAG]);
    expect(natalChart(birth(NOW)).flags).toEqual([]);
    expect(natalChart(birth(FAR, { timeScale: "tt" })).flags).toEqual([FLAG]);
    expect(natalChart({ utc: FAR, timeKnown: false, timeScale: "tt" }).flags).toEqual(["no-time"]);
    expect(natalChart(birth(FAR, { deltaT: 125 })).flags).toEqual([]);
    expect(natalChart(birth(FAR, { timeScale: "ut1" })).flags).toEqual([FLAG]);
  });

  it("accept the flag as an echo only where the calculation derives it", () => {
    expect(natalChart(birth(FAR, { flags: [FLAG] })).flags).toEqual([FLAG]);
    expect(() => natalChart(birth(NOW, { flags: [FLAG] }))).toThrow(RangeError);
    expect(() => natalChart({ utc: FAR, timeKnown: false, timeScale: "tt", flags: [FLAG] })).toThrow(RangeError);
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
    // From an engine after 1.1.0-rc.7, which sets it, a record that lacks it there is refused.
    const later = JSON.parse(json);
    later.receipt.resultFlags = [];
    later.receipt.engine.version = "1.1.0-rc.8";
    withOwnIds(later);
    expect(parseNatalEnvelope(JSON.stringify(later))).toMatchObject({ ok: false, code: "inconsistent_result" });
    later.receipt.resultFlags = [FLAG];
    withOwnIds(later);
    expect(parseNatalEnvelope(JSON.stringify(later)).ok).toBe(true);
    // On TT input it belongs with houses.
    const tt = parseNatalEnvelope(serializeNatalEnvelope(createNatalEnvelope(natalChart(birth(FAR, { timeScale: "tt" })))));
    expect(tt.ok && tt.envelope.receipt.resultFlags).toEqual([FLAG]);
    const inside = JSON.parse(serializeNatalEnvelope(createNatalEnvelope(natalChart(birth(NOW)))));
    inside.receipt.resultFlags = [FLAG];
    withOwnIds(inside);
    expect(parseNatalEnvelope(JSON.stringify(inside))).toMatchObject({ ok: false, code: "inconsistent_result" });
  });
});
