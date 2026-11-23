import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { searchLunations, searchStations } from "./calc.js";
import type { CalcRefusal, CalcTime } from "./calc.js";
import { scanEventRoots } from "./calc-event-roots.js";
import { deltaTAt } from "./deltat.js";
import { setDefaultEphemeris } from "./ephemeris.js";

function ok<T extends { status: "ok" }>(result: T | CalcRefusal): T {
  if (result.status !== "ok") throw new Error(result.detail);
  return result;
}
const april = { from: "2024-04-01", to: "2024-05-01" } as const;

describe("station and lunation search", () => {
  it.each(["de440", "astronomy-engine"] as const)("matches independent DE440s quarters and outer stations on %s", source => {
    type Case = {
      selection: 90 | 270 | "Uranus" | "Neptune" | "Pluto"; fromTtSeconds: number; toTtSeconds: number;
      events: { ttSeconds: number; toleranceSeconds: number; direction?: "direct" | "retrograde" }[];
    };
    const file = new URL("../docs/evidence/station-lunation-search/reference.json", import.meta.url);
    const { cases } = JSON.parse(readFileSync(file, "utf8")) as { cases: Case[] };
    expect(cases.map(row => row.selection)).toEqual([90, 270, "Uranus", "Neptune", "Pluto"]);
    const tt = (seconds: number) => ({ jd: 2451545 + seconds / 86400, scale: "tt" as const });
    setDefaultEphemeris(source);
    try {
      for (const { selection, fromTtSeconds, toTtSeconds, events } of cases) {
        const window = { from: tt(fromTtSeconds), to: tt(toTtSeconds) };
        const found = typeof selection === "number" ? ok(searchLunations({ ...window, phaseDegrees: selection }))
          : ok(searchStations({ ...window, body: selection }));
        expect(found.ephemeris.name).toBe(source === "de440" ? "jpl-de440" : source);
        expect(events).toHaveLength(typeof selection === "number" ? 1 : 2);
        expect(found.events).toHaveLength(events.length);
        for (const [i, expected] of events.entries()) {
          const event = found.events[i]!;
          if ("direction" in event) expect(event.direction).toBe(expected.direction);
          else {
            expect(event.phaseDegrees).toBe(selection);
            expect(expected.toleranceSeconds).toBe(2);
          }
          const seconds = (event.jdTt - 2451545) * 86400;
          expect(Math.abs(seconds - expected.ttSeconds), String(selection)).toBeLessThanOrEqual(expected.toleranceSeconds);
        }
      }
    } finally {
      setDefaultEphemeris("astronomy-engine");
    }
  });

  it("resolves all four phases against the US Naval Observatory's published UT minutes", () => {
    // https://aa.usno.navy.mil/api/moon/phases/date?date=2024-04-01&nump=5
    setDefaultEphemeris("de440");
    try {
      for (const [phaseDegrees, minute] of [
        [270, "02T03:15"], [0, "08T18:21"], [90, "15T19:13"], [180, "23T23:49"]
      ] as const) {
        const found = ok(searchLunations({ ...april, phaseDegrees }));
        expect(found.events).toHaveLength(1);
        const event = found.events[0]!;
        expect(Math.abs(Date.parse(event.at) - Date.parse(`2024-04-${minute}:00Z`))).toBeLessThan(30_000);
        expect(event.ephemeris).toEqual(found.receipt.engine.ephemeris);
        expect(event.ephemeris.name).toBe("jpl-de440");
        expect(event.flags).toEqual([]);
        expect(event.phaseDegrees).toBe(phaseDegrees);
        expect(event.relativeSpeedDegPerDay).toBeGreaterThan(0);
        expect(event.bounds.timing.value).toBeCloseTo(
          event.bracketSeconds + 86400 * event.angularAllowanceArcsec / (3600 * event.relativeSpeedDegPerDay), 10
        );
      }
    } finally {
      setDefaultEphemeris("astronomy-engine");
    }
  });

  it("owns the returned TT millisecond once across adjacent windows on both searches", () => {
    const locations = { from: "2024-01-01", to: "2025-01-01" };
    type Window = { from: CalcTime; to: CalcTime };
    for (const find of [
      (window: Window) => ok(searchStations({ ...window, body: "Mercury" })),
      (window: Window) => ok(searchLunations({ ...window, phaseDegrees: 0 }))
    ]) {
      const all = find(locations);
      expect(all.events.length).toBeGreaterThan(2);
      const split = { jd: all.events[1]!.jdTt, scale: "tt" as const };
      const left = find({ ...locations, to: split });
      const right = find({ ...locations, from: split });
      expect(left.events.at(-1)!.jdTt).toBe(split.jd);
      expect([...left.events, ...right.events].map((event) => event.at)).toEqual(all.events.map((event) => event.at));
      expect(find({ from: split, to: split })).toMatchObject({ events: [], samples: 0, ephemeris: all.ephemeris });
    }
  });

  it("computes direction and a separate curvature-dependent timing estimate for each station", () => {
    const found = ok(searchStations({ body: "Mercury", ...april }));
    expect(found.events.map((event) => event.direction)).toEqual(["retrograde", "direct"]);
    for (const event of found.events) {
      expect(event.direction).toBe(event.curvatureDegPerDay2 > 0 ? "direct" : "retrograde");
      expect(event.bounds.timing.value).toBeCloseTo(event.bracketSeconds + 86400 *
        Math.sqrt(2 * event.angularAllowanceArcsec / (3600 * Math.abs(event.curvatureDegPerDay2))), 8);
      expect(event.ephemeris.name).toBe("astronomy-engine");
      expect(event.flags).toEqual([]);
    }
  });

  it.each([1965, 1972, 2050])("reports UTC and UT1 bands and the extrapolation flag for both searches in %i", year => {
    const window = { from: `${year}-01-01`, to: `${year}-07-01` };
    for (const search of [
      ok(searchStations({ ...window, body: "Mercury" })),
      ok(searchLunations({ ...window, phaseDegrees: 0 }))
    ]) {
      expect(search.events.length).toBeGreaterThan(0);
      expect(search.flags.includes("delta-t-extrapolated")).toBe(year === 2050);
      for (const event of search.events) {
        // 1965 uses UT1 as the calendar label. In 1972 C04 contributes
        // 1.9 ms plus the table's 0.79 ms. After the table only UT1 depends on extrapolated ΔT.
        const ut1 = year === 1972 ? 0.00269 : deltaTAt(event.jdUt1 - 2451545).sigma!;
        expect(ut1).toBeGreaterThan(0);
        expect(event.band.utc).toBe(year === 1965 ? 0.03 : 0);
        expect(event.band.ut1).toBeCloseTo(ut1, 10);
        expect(event.flags.includes("delta-t-extrapolated")).toBe(year === 2050);
      }
    }
  });

  it("finds both reversals for each outer planet and preserves the label on an empty search", () => {
    setDefaultEphemeris("de440");
    try {
      for (const body of ["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const) {
        const found = ok(searchStations({ body, from: "2024-01-01", to: "2026-01-01" }));
        const directions = found.events.map(event => event.direction);
        expect(new Set(directions)).toEqual(new Set(["retrograde", "direct"]));
        directions.slice(1).forEach((direction, i) => expect(direction).not.toBe(directions[i]));
        const empty = ok(searchStations({ body, from: april.from, to: april.from }));
        expect(empty).toMatchObject({ events: [], samples: 0, flags: [], ephemeris: found.ephemeris });
      }
    } finally {
      setDefaultEphemeris("astronomy-engine");
    }
  });

  it("returns a whole refusal if the coarse scan, refinement or final probes exceed the budget", () => {
    const request = { ...april, phaseDegrees: 0 } as const;
    const all = ok(searchLunations(request));
    const unbounded = ok(searchLunations({ ...request, maxSamples: Infinity }));
    expect(ok(searchLunations(JSON.parse(JSON.stringify(unbounded.receipt.request)))).events).toEqual(all.events);
    expect(searchLunations({ ...request, maxSamples: 1 })).toMatchObject({ reason: "sample-budget", samples: 0 });
    for (const maxSamples of [32, all.samples - 1]) {
      const refused = searchLunations({ ...request, maxSamples });
      expect(refused).toMatchObject({ status: "refused", reason: "sample-budget", samples: maxSamples, maxSamples });
      expect(refused).not.toHaveProperty("events");
    }
    expect(ok(searchLunations({ ...request, maxSamples: all.samples })).events).toEqual(all.events);
  });

  it("validates malformed requests and returns typed range and pinned-clock refusals", () => {
    expect(() => searchStations({ ...april, body: "Moon" as "Mars" })).toThrow(RangeError);
    expect(() => searchLunations({ ...april, phaseDegrees: 360 as 0 })).toThrow(RangeError);
    expect(() => searchLunations({ from: april.to, to: april.from, phaseDegrees: 0 })).toThrow(RangeError);
    expect(() => searchStations({ ...april, body: "Mars", maxSamples: NaN })).toThrow(RangeError);
    expect(searchStations({ ...april, body: "Mars", from: "1760-01-01" })).toMatchObject({ reason: "out-of-range" });
    expect(searchStations({ ...april, body: "Mars", from: { iso: april.from, deltaT: 66 } })).toMatchObject({ reason: "unsupported-combination" });
  });

  it("excludes a stationary touch and includes an exact upper-end reversal", () => {
    const day = 86_400_000;
    expect(scanEventRoots(0, 2 * day, false, (t) => ((t - day) / day) ** 2, Infinity)).toMatchObject({ roots: [] });
    expect(scanEventRoots(0, day, false, (t) => (day - t) / day, Infinity)).toMatchObject({ roots: [{ ttMs: day, rising: false }] });
    expect(scanEventRoots(day, 2 * day, false, (t) => (day - t) / day, Infinity)).toMatchObject({ roots: [] });
    expect(() => scanEventRoots(0, day, false, () => NaN, Infinity)).toThrow(RangeError);
  });
});
