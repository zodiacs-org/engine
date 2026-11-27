import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { random } from "../scripts/continuous-utc-instants.mjs";
import { CALC_SPAN, calc, searchLunations, searchStations } from "./calc.js";
import type { CalcRefusal, CalcTime, LunationAngle, StationBody } from "./calc.js";
import { useDe440 } from "./de440-pack.js";
import { setDefaultEphemeris } from "./ephemeris.js";

const DAY = 86_400_000;
const HOUR = DAY / 24;
const phases = [0, 90, 180, 270] as const;
const tt = (jd: number) => ({ jd, scale: "tt" as const });
const ttMs = (ms: number) => tt(2440587.5 + ms / DAY);
const wrap = (degrees: number) => (degrees % 360 + 540) % 360 - 180;
const april = { from: "2024-04-01", to: "2024-05-01" };

function ok<T extends { status: "ok" }>(result: T | CalcRefusal): T {
  if (result.status !== "ok") throw new Error(result.detail);
  return result;
}

type Window = { from: CalcTime; to: CalcTime; maxSamples?: number };
const stations = (body: StationBody) => (window: Window) => searchStations({ ...window, body });
const lunations = (phaseDegrees: LunationAngle) => (window: Window) => searchLunations({ ...window, phaseDegrees });
const searches = [
  { name: "Mercury", find: stations("Mercury") }, { name: "Pluto", find: stations("Pluto") },
  ...phases.map(angle => ({ name: `phase ${angle}`, find: lunations(angle) }))
];
const longitude = (body: StationBody | "Moon" | "Sun", jd: number) => ok(calc({ body, time: tt(jd) })).lon;

// The shipped pack is loaded once (useDe440(), which makes it the default) and the default set back to
// astronomy-engine, so that each test chooses its source with setDefaultEphemeris.
beforeAll(() => {
  useDe440();
  setDefaultEphemeris("astronomy-engine");
});
afterEach(() => setDefaultEphemeris("astronomy-engine"));

it("keeps the same TT millisecond across cuts through the August 1813 Mars station", () => {
  setDefaultEphemeris("de440");
  const find = (from: CalcTime, to: CalcTime) => ok(searchStations({ from, to, body: "Mars" })).events;
  const from = tt(2383485.12345);
  const to = tt(2383487);
  const whole = find(from, to);
  expect(whole).toHaveLength(1);
  expect(find(tt(2383486.25), tt(2383486.75))).toEqual(whole);
  const root = whole[0]!.jdTt;
  for (const ms of [-2, -1, 0, 1, 2]) {
    const split = tt(root + ms / DAY);
    expect(find(from, split)).toEqual(ms < 0 ? [] : whole);
    expect(find(split, to)).toEqual(ms < 0 ? whole : []);
  }
});

describe.each(["de440", "astronomy-engine"] as const)("event search on %s", source => {
  beforeEach(() => setDefaultEphemeris(source));

  it.each(searches)("partitions complete $name events at generated endpoints on the TT grid", ({ find }) => {
    const next = random(347);
    // Three eras, fractional days and many independently positioned scan grids.
    for (const year of [1831, 2024, 2173]) {
      const start = Date.UTC(year, 0, 1) + Math.floor(next() * 60 * DAY);
      const end = start + (365 + Math.floor(next() * 40)) * DAY;
      const all = ok(find({ from: ttMs(start), to: ttMs(end) })).events;
      expect(all.length).toBeGreaterThanOrEqual(2);
      const cuts = [
        ttMs(start).jd, ttMs(end).jd,
        ...Array.from({ length: 8 }, () => ttMs(start + Math.floor(next() * (end - start))).jd)
      ];
      for (const event of all) cuts.push(event.jdTt - 1 / DAY, event.jdTt, event.jdTt + 1 / DAY);
      cuts.sort((a, b) => a - b);
      const pieces = cuts.slice(1).flatMap((hi, i) => {
        const lo = cuts[i]!;
        const actual = [...ok(find({ from: tt(lo), to: tt(hi) })).events];
        expect(actual, `TT (${lo}, ${hi}]`).toEqual(all.filter(e => e.jdTt > lo && e.jdTt <= hi));
        return actual;
      });
      expect(pieces).toEqual(all);
      expect(new Set(pieces.map(e => e.jdTt)).size).toBe(all.length);
    }
  });

  it("resolves two Mercury loops and both shallow Pluto reversals with their local timing bounds", () => {
    const window = { from: "2024-03-01", to: "2024-11-01" };
    const mercury = ok(stations("Mercury")(window)).events;
    const pluto = ok(stations("Pluto")(window)).events;
    expect(mercury.map(e => e.direction)).toEqual(["retrograde", "direct", "retrograde", "direct"]);
    expect(pluto.map(e => e.direction)).toEqual(["retrograde", "direct"]);
    for (const e of [...mercury, ...pluto]) {
      // Independently form the curvature from three longitudes two TT hours apart.
      const centre = longitude(e.body, e.jdTt);
      const before = wrap(centre - longitude(e.body, e.jdTt - 2 / 24));
      const after = wrap(longitude(e.body, e.jdTt + 2 / 24) - centre);
      expect(Math.sign(after)).toBe(e.direction === "direct" ? 1 : -1);
      expect(Math.sign(before)).toBe(-Math.sign(after));
      expect(e.curvatureDegPerDay2).toBeCloseTo((after - before) * 144, 6);
      const seconds = 86400 * Math.sqrt(2 * e.angularAllowanceArcsec / (3600 * Math.abs(e.curvatureDegPerDay2)));
      expect(e.bounds.timing.value).toBeCloseTo(e.bracketSeconds + seconds, 7);
    }
    expect(Math.min(...pluto.map(e => e.bounds.timing.value!))).toBeGreaterThan(
      Math.max(...mercury.map(e => e.bounds.timing.value!))
    );
  });

  it("finds successive quarter turns on the increasing Moon minus Sun angle across longitude wraps", () => {
    const events = phases.flatMap(angle => [...ok(lunations(angle)({
      from: "2024-04-07", to: "2024-05-07"
    })).events]).sort((a, b) => a.jdTt - b.jdTt);
    expect(events.map(e => e.phaseDegrees)).toEqual(phases);
    for (const e of events) {
      const offset = (jd: number) => wrap(longitude("Moon", jd) - longitude("Sun", jd) - e.phaseDegrees);
      expect(Math.abs(offset(e.jdTt))).toBeLessThan(0.000001);
      const before = offset(e.jdTt - 1 / 24);
      const after = offset(e.jdTt + 1 / 24);
      expect(before).toBeLessThan(0);
      expect(after).toBeGreaterThan(0);
      expect(e.relativeSpeedDegPerDay).toBeCloseTo((after - before) * 12, 6);
    }
  });
});

describe.each([stations("Mercury"), lunations(0)])("search window validation", find => {
  it("refuses the shipped DE440 boundary dates outside the calc span, even on a partial overlap", () => {
    setDefaultEphemeris("de440");
    for (const date of ["1790-01-02", "2209-12-31"]) {
      const partial = date < april.from ? { from: date, to: april.to } : { from: april.from, to: date };
      for (const window of [{ from: date, to: date }, partial]) {
        expect(find(window)).toMatchObject({ status: "refused", reason: "out-of-range", span: CALC_SPAN });
      }
    }
    for (const window of [
      { from: "1800-01-01T00:05:00Z", to: "1800-05-01" },
      { from: "2199-08-01", to: "2199-12-31T23:55:00Z" }
    ]) {
      const result = ok(find(window));
      expect(result.events.length).toBeGreaterThan(0);
      for (const row of [result, ...result.events]) {
        expect(row.ephemeris.name).toBe("jpl-de440");
        expect(row.flags).not.toContain("outside-de440-span");
      }
    }
  });

  it("owns exact endpoints once and performs no samples for a zero-width interval", () => {
    const all = ok(find(april));
    const event = all.events[0]!;
    const end = tt(event.jdTt);
    expect(ok(find({ from: tt(event.jdTt - 1 / DAY), to: end })).events).toEqual([event]);
    expect(ok(find({ from: end, to: tt(event.jdTt + 1 / DAY) })).events).toEqual([]);
    expect(ok(find({ from: end, to: end, maxSamples: 1 }))).toMatchObject({
      events: [], samples: 0, ephemeris: all.ephemeris, flags: []
    });
    expect(() => find({ from: end, to: tt(event.jdTt - 1 / DAY) })).toThrow(RangeError);
  });

  it("rejects nonfinite endpoints and invalid budgets, and accepts an unlimited budget", () => {
    for (const n of [NaN, Infinity, -Infinity]) {
      for (const invalid of [n as never, tt(n), new Date(n)]) {
        expect(() => find({ ...april, from: invalid })).toThrow(RangeError);
        expect(() => find({ ...april, to: invalid })).toThrow(RangeError);
      }
    }
    for (const maxSamples of [NaN, -Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => find({ ...april, maxSamples })).toThrow(RangeError);
    }
    expect(find({ ...april, maxSamples: Infinity })).toEqual(find(april));
  });
});

it("rejects the luminaries, unsupported names and malformed phase angles with RangeError", () => {
  for (const body of ["Sun", "Moon", "Earth", "Ceres", "mercury", "constructor", "__proto__", null]) {
    expect(() => searchStations({ ...april, body: body as StationBody })).toThrow(RangeError);
  }
  for (const phase of [NaN, Infinity, -Infinity, -90, 360, 45, "90", null]) {
    expect(() => searchLunations({ ...april, phaseDegrees: phase as LunationAngle })).toThrow(RangeError);
  }
});

it("selects one labelled source for the full TT window and its probes at either pack handoff", async () => {
  // The shipped pack is wider than CALC_SPAN. Substitute only its coverage metadata
  // so both handoffs are reachable through the public searches, with real positions.
  const low = Date.UTC(2024, 3, 1);
  const high = Date.UTC(2024, 4, 1);
  const j2000 = Date.UTC(2000, 0, 1, 12);
  vi.resetModules();
  try {
    const api = await import("./calc.js");
    const { setDefaultEphemeris: select } = await import("./ephemeris.js");
    // The shipped pack's source, registered as the default's opener as useDe440() registers it, with its coverage narrowed.
    const { registerDe440Source } = await import("./ephemeris-default.js");
    const source = (await import("./de440-pack.js")).shippedDe440Source();
    registerDe440Source(() => ({
      ...source, pack: { ...source.pack,
        // The default ephemeris keeps one day inside each raw edge.
        startEtSecTdb: (low - DAY - j2000) / 1000, stopEtSecTdb: (high + DAY - j2000) / 1000
      }
    }));
    for (const { find, pad } of [
      { find: (w: Window) => api.searchStations({ ...w, body: "Mercury" }), pad: 2 * HOUR },
      { find: (w: Window) => api.searchLunations({ ...w, phaseDegrees: 90 }), pad: HOUR }
    ]) {
      for (const [from, to] of [
        [low - DAY, high - DAY], [low + DAY, high + DAY], // each endpoint can force fallback
        [low + pad - 1, high - pad], [low + pad, high - pad + 1] // only the outermost probe is outside
      ] as const) {
        const window = { from: ttMs(from), to: ttMs(to) };
        select("astronomy-engine");
        const explicit = ok(find(window));
        select("de440");
        const fallback = ok(find(window));
        expect(fallback.receipt.engine.ephemeris).toEqual(explicit.ephemeris);
        expect(fallback.ephemeris.name).toBe("astronomy-engine");
        expect(fallback.flags).toEqual(["outside-de440-span"]);
        expect(explicit.events.length).toBeGreaterThan(0);
        expect(fallback.events).toEqual(explicit.events.map(e => ({ ...e, flags: ["outside-de440-span"] })));
      }
      // A stencil may land exactly on either inclusive edge.
      const inside = ok(find({ from: ttMs(low + pad), to: ttMs(high - pad) }));
      expect(inside.ephemeris.name).toBe("jpl-de440");
      expect(inside.flags).toEqual([]);
      for (const ms of [low - 1, low, high, high + 1]) {
        const within = ms >= low && ms <= high;
        const empty = ok(find({ from: ttMs(ms), to: ttMs(ms) }));
        expect(empty).toMatchObject({ events: [], samples: 0,
          ephemeris: { name: within ? "jpl-de440" : "astronomy-engine" }, flags: within ? [] : ["outside-de440-span"] });
      }
    }
    // Split between the two sources' reported instants for the April new Moon.
    // The right subwindow still crosses the pack edge and sees the same lunation again.
    const from = ttMs(low + DAY);
    const to = ttMs(high + DAY);
    const split = "2024-04-08T18:20:53Z";
    const newMoons = (window: Window) => ok(api.searchLunations({ ...window, phaseDegrees: 0 }));
    const whole = newMoons({ from, to });
    const left = newMoons({ from, to: split });
    const right = newMoons({ from: split, to });
    expect(whole.events).toMatchObject([{ at: "2024-04-08T18:20:55.053Z",
      ephemeris: { name: "astronomy-engine" }, flags: ["outside-de440-span"] }]);
    expect(left.events).toMatchObject([{ at: "2024-04-08T18:20:51.548Z",
      ephemeris: { name: "jpl-de440" }, flags: [] }]);
    expect(left.events[0]!.jdTt).toBeLessThan(whole.events[0]!.jdTt);
    expect(right.events).toEqual(whole.events);
  } finally {
    vi.resetModules();
  }
});
