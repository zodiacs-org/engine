import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as engine from "../src/engine.js";
import * as crossings from "../../src/crossings.js";
import {
  MONTH_CONVENTIONS, MONTH_NAMES, instantaneousPanchang, luminarySnapshot, searchLunarMonths
} from "../src/index.js";
import type { LunarMonths, MonthOptions, MonthResult } from "../src/index.js";
import { DAY, EPOCH, iso, UNIT } from "./analytical.js";

function ok(result: MonthResult): LunarMonths {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}
function refused(result: MonthResult, reason: string): void {
  expect(result).toMatchObject({ status: "refused", reason });
  for (const key of ["startMonth", "intervals", "events"]) expect(result).not.toHaveProperty(key);
}
afterEach(() => vi.restoreAllMocks());

// Independently prescribed dyadic coordinates, not astronomical positions.
// Receipts from the seed supply types only and certify none of these values.
function source(offset = 7, elongation = 0, solarRate = 1, direction = 1): void {
  const seed = luminarySnapshot(iso(0));
  if (seed.status !== "ok") throw new Error("Seed coverage");
  const wrap = (n: number) => ((n % 360) + 360) % 360;
  vi.spyOn(engine, "luminarySnapshot").mockImplementation((at) => {
    const date = at as Date;
    const t = direction * (date.getTime() - EPOCH) / UNIT;
    const sun = wrap(offset + solarRate * t);
    const moon = wrap(offset + elongation + (solarRate + 12) * t);
    return { ...seed, utc: date.toISOString(),
      sun: { tropical: { ...seed.sun.tropical, lon: sun }, sidereal: { ...seed.sun.sidereal, lon: sun } },
      moon: { tropical: { ...seed.moon.tropical, lon: moon }, sidereal: { ...seed.moon.sidereal, lon: moon } } };
  });
}
const monthNames = ["Chaitra", "Vaisakha", "Jyaishtha", "Ashadha", "Sravana", "Bhadrapada",
  "Asvina", "Kartika", "Margasirsha", "Pausha", "Magha", "Phalguna"];

describe("independent lunar month definitions and rational phase roots (SOURCES.md)", () => {
  it.each(Array.from({ length: 12 }, (_, sign) => sign))("maps solar sign %i at initial new moon into its month", (sign) => {
    source(sign * 30 + 7);
    const result = ok(searchLunarMonths(iso(1), iso(DAY), { monthConvention: "amanta" }));
    const month = result.startMonth;
    const index = (sign + 1) % 12; // Pisces -> Chaitra; Aries -> Vaisakha (CRC table 16).
    expect(MONTH_NAMES).toEqual(monthNames);
    expect(month).toMatchObject({ convention: "amanta", index, name: monthNames[index],
      start: { kind: "new-moon", at: iso(0) }, end: { kind: "new-moon", at: iso(30 * UNIT) },
      namingLunation: { solarSignAtStart: sign, fullMoon: { at: iso(15 * UNIT), kind: "full-moon" } } });
    expect(month.namingLunation.ingresses.map(({ at, sign }) => [at, sign])).toEqual([[iso(23 * UNIT), (sign + 1) % 12]]);
    expect(month.start).toBe(month.namingLunation.start);
    expect(month.end).toBe(month.namingLunation.end);
  });

  it.each(["amanta", "purnimanta"] as const)("finds true boundaries of a %s month with no internal event", (monthConvention) => {
    source(337); // Pisces at t = 0: Chaitra in the shared waxing half.
    const result = ok(searchLunarMonths(iso(1), iso(2), { monthConvention }));
    expect(result.startMonth.name).toBe("Chaitra");
    expect(result.events).toEqual([]);
    expect(result.intervals).toHaveLength(1);
    expect(result.startMonth.start.at).toBe(iso(monthConvention === "amanta" ? 0 : -15 * UNIT));
    expect(result.startMonth.end.at).toBe(iso(monthConvention === "amanta" ? 30 * UNIT : 15 * UNIT));
    expect(result.startMonth.namingLunation.start.at).toBe(iso(0));
    expect(result.startMonth.namingLunation.end.at).toBe(iso(30 * UNIT));
  });

  it("purnimanta changes at full moon and keeps its name through new moon", () => {
    source(337);
    const atFull = ok(searchLunarMonths(iso(15 * UNIT - 1), iso(15 * UNIT + 1), { monthConvention: "purnimanta" }));
    expect(atFull.intervals.map(({ name }) => name)).toEqual(["Chaitra", "Vaisakha"]);
    expect(atFull.intervals[0]!.end).toBe(atFull.intervals[1]!.start);
    const waning = atFull.intervals[1]!;
    expect(waning.start.at).toBe(iso(15 * UNIT));
    expect(waning.end.at).toBe(iso(45 * UNIT));
    expect(waning.namingLunation.start.at).toBe(iso(30 * UNIT));
    expect(waning.namingLunation.end.at).toBe(iso(60 * UNIT));
    const atNew = ok(searchLunarMonths(iso(30 * UNIT - 1), iso(30 * UNIT + 1), { monthConvention: "purnimanta" }));
    expect(atNew.intervals.map(({ name }) => name)).toEqual(["Vaisakha"]);
    expect(atNew.events.map(({ kind, at }) => [kind, at])).toEqual([["new-moon", iso(30 * UNIT)]]);
  });

  it.each(["amanta", "purnimanta"] as const)("gives a %s boundary to the following interval", (monthConvention) => {
    source();
    const boundary = monthConvention === "amanta" ? 30 * UNIT : 15 * UNIT;
    const left = ok(searchLunarMonths(iso(boundary - 1), iso(boundary), { monthConvention }));
    const right = ok(searchLunarMonths(iso(boundary), iso(boundary + 1), { monthConvention }));
    expect(left.startMonth.end).toEqual(right.startMonth.start);
    expect(left.events).toEqual([]);
    expect(right.events[0]!.at).toBe(iso(boundary));
    expect(right.startMonth.index).toBe((left.startMonth.index + 1) % 12);
  });

  it.each([-1, 0, 1])("rounds signed rational new/full-moon roots upwards around cycle %i", (cycle) => {
    source(7, 5);
    // E(t) = 5 + 12t/U. Solve E = 360k (new) or 180 + 360k (full).
    const ceiling = (n: bigint) => Number(n >= 0n ? (n + 11n) / 12n : n / 12n);
    for (const full of [false, true]) {
      const root = ceiling(BigInt(360 * cycle + (full ? 180 : 0) - 5) * BigInt(UNIT));
      const result = ok(searchLunarMonths(iso(root - 1), iso(root + 1), {
        monthConvention: full ? "purnimanta" : "amanta" }));
      expect(result.events.map(({ kind, at }) => [kind, at])).toEqual([[full ? "full-moon" : "new-moon", iso(root)]]);
      expect(result.intervals[1]!.start.at).toBe(iso(root));
    }
  });

  it("orders simultaneous phase/ingress events and counts ingress ties in the ending lunation", () => {
    source(0);
    const result = ok(searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta" }));
    expect(result.events.map(({ kind }) => kind)).toEqual(["new-moon", "solar-ingress"]);
    expect(result.startMonth.namingLunation.ingresses.map(({ at }) => at)).toEqual([iso(30 * UNIT)]);
    expect(result.startMonth.namingLunation.solarSignAtStart).toBe(0);
    expect(result.startMonth.name).toBe("Vaisakha");
    expect(result.events.every(({ before, after }) => before.utc === iso(-1) && after.utc === iso(0))).toBe(true);
  });

  it("reports an isolated solar ingress without changing the lunar month", () => {
    source();
    const ingress = 23 * UNIT;
    const result = ok(searchLunarMonths(iso(ingress - 1), iso(ingress + 1), { monthConvention: "amanta" }));
    expect(result.intervals).toHaveLength(1);
    expect(result.events.map(({ kind, at, sign }) => [kind, at, sign])).toEqual([["solar-ingress", iso(ingress), 1]]);
    expect(result.events[0]).toBe(result.startMonth.namingLunation.ingresses[0]);
  });

  it("reuses the engine crossing solver and bounds shared cached snapshot work", () => {
    source();
    const solver = vi.spyOn(crossings, "searchLongitudeCrossingsWith");
    const result = ok(searchLunarMonths(iso(0), iso(2 * DAY), { monthConvention: "amanta", maxSamples: Infinity }));
    expect(result.conventions).toBe(MONTH_CONVENTIONS);
    expect(result.searchFrom).toBe(iso(-64 * DAY));
    expect(result.searchTo).toBe(iso(66 * DAY));
    expect(solver.mock.calls.map((call) => [call[1], call[5]])).toEqual([
      ["phase", { stepDays: 1 / 4 }], ["solar", { stepDays: 1 / 4 }]
    ]);
    const calls = vi.mocked(engine.luminarySnapshot).mock.calls;
    expect(new Set(calls.map(([at]) => (at as Date).getTime())).size).toBe(result.samples);
    expect(calls).toHaveLength(result.samples);
    expect(result.longitudeSamples).toBeGreaterThan(result.samples);
    expect(result.maxSamples).toBe(Infinity);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.intervals)).toBe(true);
    expect(Object.isFrozen(result.startMonth.namingLunation.ingresses)).toBe(true);
  });
});

describe("constructed month anomalies from independent rational trajectories", () => {
  it.each(["amanta", "purnimanta"] as const)("detects a zero-ingress %s adhika month", (monthConvention) => {
    source(7, 0, 1 / 2); // Sun moves from 7 to 22 degrees during t=0..30U.
    const result = ok(searchLunarMonths(iso(15 * UNIT - 1), iso(15 * UNIT + 1), { monthConvention }));
    expect(result.intervals).toHaveLength(1); // Full moon does not split an adhika month.
    expect(result.startMonth).toMatchObject({ name: "Vaisakha", kind: "adhika", omittedMonths: [],
      start: { at: iso(0) }, end: { at: iso(30 * UNIT) },
      namingLunation: { kind: "adhika", ingresses: [], omittedMonths: [] } });
  });

  it.each(["amanta", "purnimanta"] as const)("keeps %s kshaya naming and the omitted month explicit", (monthConvention) => {
    source(7, 0, 2); // Two ingresses: Sun=30 at 23U/2, Sun=60 at 53U/2.
    const month = ok(searchLunarMonths(iso(1), iso(2), { monthConvention })).startMonth;
    expect(month).toMatchObject({ name: "Vaisakha", index: 1, kind: "kshaya",
      omittedMonths: [{ name: "Jyaishtha", index: 2 }],
      namingLunation: { kind: "kshaya", ingresses: [{ at: iso(23 * UNIT / 2), sign: 1 },
        { at: iso(53 * UNIT / 2), sign: 2 }] } });
    expect(month.namingLunation.omittedMonths).toBe(month.omittedMonths);
    expect(Object.isFrozen(month.omittedMonths[0])).toBe(true);
    const following = ok(searchLunarMonths(iso(31 * UNIT), iso(31 * UNIT + 1), { monthConvention })).startMonth;
    expect(following.name).toBe("Ashadha");
  });

  it("reports kshaya across the month-name cycle wrap", () => {
    source(307, 0, 2); // Aquarius -> Pisces -> Aries, omitting Chaitra.
    const month = ok(searchLunarMonths(iso(1), iso(2), { monthConvention: "amanta" })).startMonth;
    expect(month).toMatchObject({ name: "Phalguna", index: 11, kind: "kshaya",
      omittedMonths: [{ name: "Chaitra", index: 0 }] });
  });

  it("separates the regular purnimanta halves around a new-to-new adhika month", () => {
    source(7, 0, 1 / 2);
    const before = ok(searchLunarMonths(iso(-1), iso(1), { monthConvention: "purnimanta" }));
    expect(before.intervals.map(({ name, kind, start, end }) => [name, kind, start.at, end.at])).toEqual([
      ["Vaisakha", "ordinary", iso(-15 * UNIT), iso(0)],
      ["Vaisakha", "adhika", iso(0), iso(30 * UNIT)]
    ]);
    // Its naming source has zero ingresses, but the preceding dark half is regular.
    expect(before.startMonth.namingLunation.kind).toBe("adhika");
    const after = ok(searchLunarMonths(iso(30 * UNIT - 1), iso(30 * UNIT + 1), { monthConvention: "purnimanta" }));
    expect(after.intervals.map(({ name, kind, start, end }) => [name, kind, start.at, end.at])).toEqual([
      ["Vaisakha", "adhika", iso(0), iso(30 * UNIT)],
      ["Vaisakha", "ordinary", iso(30 * UNIT), iso(45 * UNIT)]
    ]);
  });

  it("uses after-new-moon signs and right-closed ingress counts at an exact tie", () => {
    source(0, 0, 1 / 2);
    const result = ok(searchLunarMonths(iso(-1), iso(1), { monthConvention: "amanta" }));
    expect(result.intervals.map(({ name, kind }) => [name, kind])).toEqual([["Chaitra", "ordinary"], ["Vaisakha", "adhika"]]);
    expect(result.intervals[0]!.namingLunation.ingresses.map(({ at }) => at)).toEqual([iso(0)]);
    expect(result.intervals[1]!.namingLunation.ingresses).toEqual([]);
    expect(result.events.map(({ kind }) => kind)).toEqual(["new-moon", "solar-ingress"]);
  });
});

describe("month validation, budgets and whole-result refusals", () => {
  it.each([undefined, null, [], {}, { monthConvention: null }, { monthConvention: "regional" },
    { monthConvention: "amanta", ayanamsa: "unknown" }, { monthConvention: "amanta", ayanamsa: null },
    { monthConvention: "amanta", maxSamples: 0 }, { monthConvention: "amanta", maxSamples: NaN },
    { monthConvention: "amanta", maxSamples: 1.5 }, { monthConvention: "amanta", maxSamples: null },
    { monthConvention: "amanta", [Symbol("unknown")]: 1 }])("rejects options before sampling: %j", (options) => {
    const snapshot = vi.spyOn(engine, "luminarySnapshot");
    expect(() => searchLunarMonths(iso(0), iso(1), options as MonthOptions)).toThrow(RangeError);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("rejects accessor options without invoking getters", () => {
    const getter = vi.fn(() => "amanta");
    expect(() => searchLunarMonths(iso(0), iso(1), Object.defineProperty({}, "monthConvention", { get: getter }) as MonthOptions))
      .toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([[iso(0), iso(0)], [iso(1), iso(0)], [iso(0), iso(2 * DAY + 1)], ["invalid", iso(1)]])(
    "rejects invalid windows %s..%s", (from, to) => {
      expect(() => searchLunarMonths(from, to, { monthConvention: "amanta" })).toThrow(RangeError);
    });

  it("counts refinement and endpoint snapshots in a single budget without exposing partial months", () => {
    source();
    const full = ok(searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta" }));
    expect(full.maxSamples).toBe(5000);
    const limited = searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta", maxSamples: full.samples - 1 });
    refused(limited, "sample-budget");
    expect(limited.samples).toBe(full.samples - 1);
    expect(ok(searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta", maxSamples: full.samples })).samples).toBe(full.samples);
    const tiny = searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta", maxSamples: 1 });
    refused(tiny, "sample-budget");
    expect(tiny.samples).toBe(1);
    expect(tiny.longitudeSamples).toBe(0);
  });

  it.each(["1800-01-02", "2199-12-29"])("retains padded-coverage engine refusals near %s", (from) => {
    const result = searchLunarMonths(from, Date.parse(from) + DAY, { monthConvention: "amanta" });
    refused(result, "engine-refused");
    if (result.status === "refused") expect(result.engine?.engine.status).toBe("refused");
  });

  it.each(["1941-01-01", "1972-01-01", "2017-01-01", "2027-10-02"])("refuses padded time-basis discontinuities near %s", (from) => {
    refused(searchLunarMonths(from, Date.parse(from) + DAY, { monthConvention: "purnimanta" }), "time-basis-discontinuity");
  });

  it("refuses unsupported ingress counts", () => {
    source(7, 0, 3);
    refused(searchLunarMonths(iso(1), iso(2), { monthConvention: "amanta" }), "unsupported-ingress-count");
  });

  it("refuses backwards phase motion", () => {
    source(7, 0, 1, -1);
    refused(searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta" }), "unresolved-crossing");
  });

  it("refuses when the phase solver cannot bracket a month", () => {
    vi.spyOn(crossings, "searchLongitudeCrossingsWith").mockReturnValue({ status: "complete", crossings: [], samples: 0 });
    refused(searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta" }), "unbracketed-month");
  });

  it("refuses missing ingress evidence rather than mislabelling the lunation adhika", () => {
    source();
    const original = crossings.searchLongitudeCrossingsWith;
    vi.spyOn(crossings, "searchLongitudeCrossingsWith").mockImplementation((position, body, target, from, to, options) =>
      body === "solar" ? { status: "complete", crossings: [], samples: 0 } : original(position, body, target, from, to, options));
    refused(searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta" }), "unresolved-crossing");
  });

  it("preserves an interior engine refusal and propagates unexpected failures", () => {
    const refusal = luminarySnapshot("1750-01-01");
    if (refusal.status !== "refused") throw new Error("Expected refusal");
    source();
    const original = vi.mocked(engine.luminarySnapshot).getMockImplementation()!;
    vi.mocked(engine.luminarySnapshot).mockImplementation((at, options) =>
      (at as Date).getTime() === EPOCH - 63 * DAY ? refusal : original(at, options));
    const result = searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta" });
    refused(result, "engine-refused");
    if (result.status === "refused") expect(result.engine).toBe(refusal);
    const error = new Error("Synthetic failure");
    vi.mocked(engine.luminarySnapshot).mockImplementation(() => { throw error; });
    expect(() => searchLunarMonths(iso(0), iso(1), { monthConvention: "amanta" })).toThrow(error);
  });
});

describe("real-engine month wiring, without independent physical accuracy claims", () => {
  it.each([["amanta", "lahiri"], ["purnimanta", "raman"]] as const)("retains %s boundaries and %s ayanamsa receipts", (monthConvention, ayanamsa) => {
    const result = ok(searchLunarMonths("2024-03-20", "2024-03-21", { monthConvention, ayanamsa }));
    expect(result.ayanamsa).toBe(ayanamsa);
    expect(result.monthConvention).toBe(monthConvention);
    for (const interval of result.intervals) {
      const lunation = interval.namingLunation;
      const events = new Set([interval.start, interval.end, lunation.start, lunation.end, lunation.fullMoon, ...lunation.ingresses]);
      for (const event of events) {
        expect(Date.parse(event.before.utc)).toBe(Date.parse(event.at) - 1);
        expect(event.after.utc).toBe(event.at);
        expect(event.after.ayanamsa.name).toBe(ayanamsa);
        expect(event.after.sun.sidereal.receipt.engine.ephemeris.version).toBe("2.1.19");
        expect(event.after).toEqual(luminarySnapshot(event.at, { ayanamsa }));
        const before = instantaneousPanchang(event.before.utc, { ayanamsa });
        const after = instantaneousPanchang(event.at, { ayanamsa });
        if (before.status !== "ok" || after.status !== "ok") throw new Error("Expected coverage");
        if (event.kind === "new-moon") expect([before.tithi.index, after.tithi.index]).toEqual([29, 0]);
        if (event.kind === "full-moon") expect([before.tithi.index, after.tithi.index]).toEqual([14, 15]);
        if (event.kind === "solar-ingress") {
          expect(Math.floor(event.after.sun.sidereal.lon / 30)).toBe(event.sign);
          expect(Math.floor(event.before.sun.sidereal.lon / 30)).toBe((event.sign! + 11) % 12);
        }
      }
    }
  });
});

describe("independently sourced astronomical anomaly cases (SOURCES.md)", () => {
  // Numerical acceptance limits were fixed in the independent retrieval
  // script before the engine was evaluated for this comparison.
  const reference = JSON.parse(readFileSync(new URL("./fixtures/kshaya-month-reference.json", import.meta.url), "utf8")) as {
    phaseAcceptanceSeconds: number; longitudeAcceptanceDegrees: number; ayanamsaAcceptanceArcseconds: number;
    rows: { newMoonUT: string; sunTropicalDegrees: number; lahiriTrueDegreesERFA: number;
      sunSiderealDegreesReference: number; solarSign: number }[];
  };
  it.each(["amanta", "purnimanta"] as const)("finds the two-ingress 1983 lunation in %s", (monthConvention) => {
    const result = ok(searchLunarMonths("1983-01-20", "1983-01-21", { monthConvention }));
    const lunation = result.startMonth.namingLunation;
    // Independent DE441 Sun at USNO new-moon minutes, minus ERFA Lahiri,
    // goes Sagittarius -> Aquarius: two sign entries and no initial Magha.
    expect(reference.rows.map(({ solarSign }) => solarSign)).toEqual([8, 10]);
    expect(result.startMonth).toMatchObject({ name: "Pausha", kind: "kshaya",
      omittedMonths: [{ index: 10, name: "Magha" }] });
    expect(lunation.ingresses.map(({ sign }) => sign)).toEqual([9, 10]);
    for (const [i, event] of [lunation.start, lunation.end].entries()) {
      const row = reference.rows[i]!;
      expect(Math.abs(Date.parse(event.at) - Date.parse(row.newMoonUT)) / 1000).toBeLessThanOrEqual(reference.phaseAcceptanceSeconds);
      const instant = luminarySnapshot(row.newMoonUT);
      if (instant.status !== "ok") throw new Error("Expected reference coverage");
      expect(Math.abs(instant.sun.tropical.lon - row.sunTropicalDegrees)).toBeLessThanOrEqual(reference.longitudeAcceptanceDegrees);
      expect(Math.abs(instant.ayanamsa.true - row.lahiriTrueDegreesERFA) * 3600)
        .toBeLessThanOrEqual(reference.ayanamsaAcceptanceArcseconds);
      expect(Math.floor(instant.sun.sidereal.lon / 30)).toBe(row.solarSign);
      expect(Math.floor(event.after.sun.sidereal.lon / 30)).toBe(row.solarSign);
      // The independent endpoints are safely away from a sign boundary.
      const remainder = row.sunSiderealDegreesReference % 30;
      expect(Math.min(remainder, 30 - remainder)).toBeGreaterThan(10 * reference.longitudeAcceptanceDegrees);
    }
  });

  // PAC Rashtriya Panchang 2026-27, Regional Calendars, Mukhya/Gauna
  // sections: regular dark half from May 2, inserted month May 17-June 15,
  // regular light half from June 15, Ashadha dark half from July 1.
  // Dates below lie inside those published half-months, away from boundaries.
  it.each([
    ["2026-05-10", "purnimanta", "Jyaishtha", "ordinary"],
    ["2026-05-20", "amanta", "Jyaishtha", "adhika"],
    ["2026-05-20", "purnimanta", "Jyaishtha", "adhika"],
    ["2026-06-05", "amanta", "Jyaishtha", "adhika"],
    ["2026-06-05", "purnimanta", "Jyaishtha", "adhika"],
    ["2026-06-20", "amanta", "Jyaishtha", "ordinary"],
    ["2026-06-20", "purnimanta", "Jyaishtha", "ordinary"],
    ["2026-07-05", "purnimanta", "Ashadha", "ordinary"]
  ] as const)("matches the published calendar interior on %s with %s", (date, monthConvention, name, kind) => {
    const month = ok(searchLunarMonths(date, Date.parse(date) + 1, { monthConvention })).startMonth;
    expect(month).toMatchObject({ name, kind, omittedMonths: [] });
    if (kind === "adhika") {
      expect(month.namingLunation.ingresses).toEqual([]);
      expect(month.start.kind).toBe("new-moon");
      expect(month.end.kind).toBe("new-moon");
    }
  });
});
