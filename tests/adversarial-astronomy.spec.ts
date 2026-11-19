/**
 * A hostile differential check of the engine's public functions, on the
 * package's default source (the shipped DE440 pack).
 *
 * The cases are the 230 of tests/fixtures/adversarial-astronomy.cases.json
 * (written by tests/fixtures/build-adversarial-cases.py, all synthetic):
 * historical time zone anomalies, polar latitudes, the Sun's ingresses, leap
 * days, unknown birth times on days the Moon or the Sun changes sign, the
 * ends of the ephemeris, and malformed input. On top of them come three
 * measurements against the repository's stored references (the conformance
 * suite's JPL Horizons positions and its house and angle vectors) and one
 * dense sweep of every house system.
 *
 * No expectation here comes from the engine's own output. The references are:
 *
 * - time zones: the IANA tz database as zic compiled it (recorded in the
 *   fixture by the generator, beside a hand-typed claim from the zone's
 *   published history), and the host's Intl at run time for instants before
 *   1970, where the engine reads its own shipped history and not Intl;
 * - positions: conformance/vectors/L1-positions.json (JPL Horizons, DE441);
 * - angles and cusps: conformance/vectors/L2-houses-angles.json;
 * - one ingress: NAIF's de440.bsp, reduced independently
 *   (docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json);
 * - coarse cross-checks written out below from published series: the Sun's
 *   apparent longitude and a 24-term Moon (Meeus, Astronomical Algorithms,
 *   2nd ed., chapters 25 and 47), the IAU 2006 mean obliquity with the four
 *   leading nutation terms (chapter 22), and Julian Day Numbers (chapter 7);
 * - invariants: every number finite and in range, the Sun's longitude
 *   increasing, whole-sign cusps at 0 degrees of each sign from the
 *   ascendant's, opposite cusps 180 degrees apart.
 *
 * What it measures is written to tests/fixtures/adversarial-astronomy.measured.json
 * (`ADVERSARIAL_WRITE=1 npx vitest run tests/adversarial-astronomy.spec.ts`)
 * and every other run is held to that file and to the limits BENCHMARK_AUDIT.md
 * quotes. A figure there is this file's, measured on this build.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prepareLocalTime, resolveBirth, resolveLocalToUtc } from "../src/geo.js";
import { HOUSE_SYSTEMS, natalChart, positions, searchLongitudeCrossings, setDefaultEphemeris } from "../src/index.js";
import type { HouseSystem, NatalChart } from "../src/index.js";
import { moonSignCandidates, moonSignsBetweenDetailed } from "../src/techniques.js";

interface Case {
  id: string;
  category: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  intlCarriesHistory?: boolean;
  note: string;
}

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const json = (relative: string) => JSON.parse(readFileSync(path(relative), "utf8")) as Record<string, unknown>;

const FIXTURE = json("./fixtures/adversarial-astronomy.cases.json") as unknown as { total: number; cases: Case[] };
const MEASURED_PATH = path("./fixtures/adversarial-astronomy.measured.json");
const casesOf = (category: string) => FIXTURE.cases.filter((entry) => entry.category === category);

const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;
const J2000_JD = 2451545.0;
const RAD = Math.PI / 180;

const mod360 = (degrees: number) => ((degrees % 360) + 360) % 360;
/** a − b, taken the short way round, degrees. */
const wrapDifference = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
const arcsec = (degrees: number) => Math.abs(degrees) * 3600;
const dateOfJd = (jd: number) => new Date(Math.round((jd - UNIX_EPOCH_JD) * DAY_MS));
/** Julian centuries of 36,525 days from J2000.0. UTC stands in for TT: at most 0.003 degrees of the Sun, 0.07 of the Moon. */
const centuries = (date: Date) => (date.getTime() / DAY_MS + UNIX_EPOCH_JD - J2000_JD) / 36525;

/** The Sun's apparent longitude, degrees: Meeus, chapter 25, the low-accuracy method (stated accuracy 0.01 degrees). */
function meeusSun(date: Date): number {
  const t = centuries(date);
  const mean = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const anomaly = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * RAD;
  const centre =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(anomaly) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * anomaly) +
    0.000289 * Math.sin(3 * anomaly);
  const node = (125.04 - 1934.136 * t) * RAD;
  return mod360(mean + centre - 0.00569 - 0.00478 * Math.sin(node));
}

/** [D, M, M', F multipliers, coefficient in 1e-6 degrees]: the 24 largest terms of Meeus's table 47.A. */
const MOON_TERMS: readonly (readonly number[])[] = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036]
];

/** The Moon's longitude of date, degrees, from the 24 terms above: a coarse series, good to about a tenth of a degree. */
function meeusMoon(date: Date): number {
  const t = centuries(date);
  const mean = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t;
  const d = (297.8501921 + 445267.1114034 * t - 0.0018819 * t * t) * RAD;
  const m = (357.5291092 + 35999.0502909 * t - 0.0001536 * t * t) * RAD;
  const mp = (134.9633964 + 477198.8675055 * t + 0.0087414 * t * t) * RAD;
  const f = (93.272095 + 483202.0175233 * t - 0.0036539 * t * t) * RAD;
  const e = 1 - 0.002516 * t - 0.0000074 * t * t;
  let sum = 0;
  for (const [kd, km, kmp, kf, coefficient] of MOON_TERMS) {
    sum += coefficient! * (Math.abs(km!) === 1 ? e : 1) * Math.sin(kd! * d + km! * m + kmp! * mp + kf! * f);
  }
  return mod360(mean + sum / 1e6);
}

/** The true obliquity of date, degrees: the IAU 2006 mean obliquity and the four leading terms of the nutation in obliquity. */
function trueObliquity(date: Date): number {
  const t = centuries(date);
  const meanArcsec = 84381.406 - 46.836769 * t - 0.0001831 * t * t + 0.0020034 * t * t * t;
  const node = (125.04452 - 1934.136261 * t) * RAD;
  const sun = (280.4665 + 36000.7698 * t) * RAD;
  const moon = (218.3165 + 481267.8813 * t) * RAD;
  const nutation = 9.2 * Math.cos(node) + 0.57 * Math.cos(2 * sun) + 0.1 * Math.cos(2 * moon) - 0.09 * Math.cos(2 * node);
  return (meanArcsec + nutation) / 3600;
}

/** Julian Day Number of a calendar date at noon: Meeus, chapter 7. */
function julianDayNumber(year: number, month: number, day: number, calendar: "gregorian" | "julian"): number {
  const y = month <= 2 ? year - 1 : year;
  const m = month <= 2 ? month + 12 : month;
  const b = calendar === "gregorian" ? 2 - Math.floor(y / 100) + Math.floor(Math.floor(y / 100) / 4) : 0;
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;
}

/** The host Intl's UTC offset at an instant, seconds east, read from the wall clock it prints. */
function intlOffsetSeconds(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", era: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(utcMs));
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  const year = part("era").startsWith("B") ? 1 - Number(part("year")) : Number(part("year"));
  const wall = new Date(0);
  wall.setUTCFullYear(year, Number(part("month")) - 1, Number(part("day")));
  wall.setUTCHours(Number(part("hour")), Number(part("minute")), Number(part("second")), 0);
  return (wall.getTime() - Math.floor(utcMs / 1000) * 1000) / 1000;
}

/** Every number anywhere in a result is finite: a NaN or an Infinity is never returned. */
function everyNumberFinite(value: unknown, where: string): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${where} is ${value}`);
  } else if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error(`${where} is an invalid Date`);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => everyNumberFinite(entry, `${where}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) everyNumberFinite(entry, `${where}.${key}`);
  }
}

const inCircle = (degrees: number) => Number.isFinite(degrees) && degrees >= 0 && degrees < 360;

/** What holds of any chart the engine returns, whatever it was asked. */
function expectSane(chart: NatalChart, id: string): void {
  everyNumberFinite(chart, id);
  expect(chart.bodies.length, id).toBeGreaterThanOrEqual(10);
  for (const body of chart.bodies) {
    const where = `${id} ${body.body}`;
    expect(inCircle(body.lon), `${where} lon ${body.lon}`).toBe(true);
    expect(Math.abs(body.lat), where).toBeLessThanOrEqual(90);
    expect(body.sign, where).toBe(SIGNS[Math.floor(body.lon / 30)]);
    expect(body.degree, where).toBeGreaterThanOrEqual(0);
    expect(body.degree, where).toBeLessThan(30);
    expect(Math.abs(body.degree - (body.lon - 30 * Math.floor(body.lon / 30))), where).toBeLessThan(1e-9);
    expect(body.retrograde, where).toBe(body.speed < 0);
  }
  const moon = chart.bodies.find((body) => body.body === "Moon")!;
  const sun = chart.bodies.find((body) => body.body === "Sun")!;
  expect(sun.speed, `${id} Sun speed`).toBeGreaterThan(0.94);
  expect(sun.speed, `${id} Sun speed`).toBeLessThan(1.03);
  expect(moon.speed, `${id} Moon speed`).toBeGreaterThan(11.5);
  expect(moon.speed, `${id} Moon speed`).toBeLessThan(15.5);
  if (chart.angles) {
    for (const angle of [chart.angles.asc, chart.angles.mc, chart.angles.dsc, chart.angles.ic]) expect(inCircle(angle), `${id} angle ${angle}`).toBe(true);
    expect(Math.abs(wrapDifference(chart.angles.dsc, chart.angles.asc + 180)), id).toBeLessThan(1e-9);
    expect(Math.abs(wrapDifference(chart.angles.ic, chart.angles.mc + 180)), id).toBeLessThan(1e-9);
  }
  if (chart.houses) {
    expect(chart.angles, id).not.toBeNull();
    expect(chart.houses.cusps, id).toHaveLength(12);
    for (const cusp of chart.houses.cusps) expect(inCircle(cusp), `${id} cusp ${cusp}`).toBe(true);
    if (chart.houses.system === "whole") expectWholeSign(chart, id);
  }
}

/** Whole-sign cusps are 0 degrees of each sign, the first the ascendant's sign. */
function expectWholeSign(chart: NatalChart, id: string): void {
  const first = 30 * Math.floor(chart.angles!.asc / 30);
  chart.houses!.cusps.forEach((cusp, index) => expect(cusp, `${id} whole-sign cusp ${index + 1}`).toBe((first + 30 * index) % 360));
}

/** The largest values seen, written to the measured file and held to it. */
const measured: Record<string, Record<string, number | string>> = {};
const note = (section: string, key: string, value: number | string) => {
  (measured[section] ??= {})[key] = value;
};
const largest = (section: string, key: string, value: number) => {
  const now = measured[section]?.[key];
  if (typeof now !== "number" || value > now) note(section, key, value);
};

beforeAll(() => setDefaultEphemeris("de440"));
afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe("the case list", () => {
  it("holds at least 100 cases, each with its own id", () => {
    expect(FIXTURE.cases).toHaveLength(FIXTURE.total);
    expect(FIXTURE.total).toBeGreaterThanOrEqual(100);
    expect(new Set(FIXTURE.cases.map((entry) => entry.id)).size).toBe(FIXTURE.total);
    note("cases", "total", FIXTURE.total);
  });
});

describe("historical time zones, against the tz database and the host's Intl", () => {
  const zoneCases = casesOf("timezone");
  let intlCompared = 0;

  it.each(zoneCases.map((entry) => [entry.id, entry] as const))("%s", async (id, entry) => {
    const { zone, date, time } = entry.input as { zone: string; date: string; time: string };
    const expected = entry.expected as { status: string; offsetSeconds: number; otherOffsetSeconds?: number; utc: string; laterUtc?: string };
    await prepareLocalTime(date, zone);
    const read = resolveLocalToUtc(date, time, zone);
    everyNumberFinite(read, id);
    expect(read.utc.getTime(), `${id} instant`).toBe(Date.parse(expected.utc));

    const status = read.jump === null ? "ok" : read.jump.kind === "gap" ? "nonexistent" : "ambiguous";
    expect(status, `${id}: ${entry.note}`).toBe(expected.status);
    // A skipped or repeated wall time is never read silently: the reading says so.
    expect(read.flags.includes("dst-gap"), id).toBe(expected.status === "nonexistent");
    expect(read.flags.includes("dst-fold"), id).toBe(expected.status === "ambiguous");
    // The offset in force at the instant returned: past the jump for a skipped time.
    const inForce = expected.status === "nonexistent" ? expected.otherOffsetSeconds! : expected.offsetSeconds;
    expect(Math.round(read.offsetMinutes * 60), `${id} offset`).toBe(inForce);

    if (expected.status === "ambiguous") {
      const later = resolveLocalToUtc(date, time, zone, { fold: "later" });
      expect(later.utc.getTime(), `${id} later reading`).toBe(Date.parse(expected.laterUtc!));
      expect(Math.round(later.offsetMinutes * 60), `${id} later offset`).toBe(expected.otherOffsetSeconds);
      expect(later.flags.includes("dst-fold"), id).toBe(true);
    }

    // Before 1970 the engine reads its own shipped history, so the host's Intl is a second, independent witness.
    if (read.zone.source === "tzdb") {
      const host = intlOffsetSeconds(zone, read.utc.getTime());
      if (entry.intlCarriesHistory) {
        expect(host, `${id} host Intl offset`).toBe(inForce);
        intlCompared += 1;
      } else {
        note("timeZones", `intlWithoutBackzone ${id}`, `tz database ${inForce} s, this host's Intl ${host} s`);
      }
    }

    // The reading's flags travel into the chart, which is sane at that instant.
    if (read.utc.getUTCFullYear() >= 1850) {
      const chart = natalChart({ utc: read.utc, flags: read.flags, latitude: 0, longitude: 0 });
      expectSane(chart, id);
      for (const flag of read.flags) expect(chart.flags, id).toContain(flag);
    }
  });

  it("counts what was compared", () => {
    note("timeZones", "cases", zoneCases.length);
    note("timeZones", "nonexistent", zoneCases.filter((entry) => entry.expected.status === "nonexistent").length);
    note("timeZones", "ambiguous", zoneCases.filter((entry) => entry.expected.status === "ambiguous").length);
    note("timeZones", "heldToHostIntl", intlCompared);
    expect(intlCompared).toBeGreaterThan(30);
  });

  it("refuses a wall time before 1970 whose zone history was not loaded, and never guesses", () => {
    expect(() => resolveLocalToUtc("1955-05-05", "05:55", "Asia/Ulaanbaatar")).toThrow(/prepareLocalTime/u);
  });
});

describe("polar latitudes, Placidus beside whole sign", () => {
  const polar = casesOf("polar");

  it.each(polar.map((entry) => [entry.id, entry] as const))("%s", (id, entry) => {
    const input = entry.input as { utc: string; latitude: number; longitude: number; houseSystem: HouseSystem };
    const chart = natalChart(input);
    expectSane(chart, id);
    expect(chart.angles, id).not.toBeNull();
    expect(chart.houses, id).not.toBeNull();
    const fallback = chart.flags.includes("polar-fallback");
    if (entry.expected.houses === "computed") {
      // Outside the circle Placidus is computed: the angles are its 1st and 10th cusps, and opposite cusps are opposite.
      expect(fallback, id).toBe(false);
      expect(chart.houses!.system, id).toBe("placidus");
      const { cusps } = chart.houses!;
      expect(arcsec(wrapDifference(cusps[0]!, chart.angles!.asc)), id).toBeLessThan(1e-6);
      expect(arcsec(wrapDifference(cusps[9]!, chart.angles!.mc)), id).toBeLessThan(1e-6);
      for (let index = 0; index < 6; index += 1) expect(arcsec(wrapDifference(cusps[index + 6]!, cusps[index]! + 180)), id).toBeLessThan(1e-6);
      const turn = cusps.reduce((sum, cusp, index) => sum + mod360(cusps[(index + 1) % 12]! - cusp), 0);
      expect(Math.abs(turn - 360), `${id}: cusps in zodiacal order`).toBeLessThan(1e-9);
    } else {
      // Inside it Placidus has no cusps. The engine says so and gives whole-sign houses under their own name.
      expect(chart.houses!.system, id).toBe("whole");
      expect(fallback, `${id}: ${entry.note}`).toBe(entry.expected.houses === "fallback");
      expectWholeSign(chart, id);
    }
    // Inside the circle, by the obliquity formula above and not by the engine's word, every chart says its angles are polar.
    const insideCircle = Math.abs(input.latitude) >= 90 - trueObliquity(new Date(input.utc));
    expect(chart.flags.includes("polar-angles"), `${id}: polar-angles`).toBe(insideCircle);
    expect(insideCircle, id).toBe(entry.expected.houses !== "computed" && Math.abs(input.latitude) > 66.5);
    // The house system changes no angle.
    const other = natalChart({ ...input, houseSystem: input.houseSystem === "whole" ? "placidus" : "whole" });
    expect(other.angles!.asc, id).toBe(chart.angles!.asc);
    expect(other.angles!.mc, id).toBe(chart.angles!.mc);
  });

  it.each(casesOf("polar-boundary").map((entry) => [entry.id, entry] as const))("%s: the fallback begins at 90 degrees less the true obliquity", (id, entry) => {
    const { utc, longitude } = entry.input as { utc: string; longitude: number };
    const firstLatitudeWith = (flag: string, houseSystem: HouseSystem, sign: 1 | -1) => {
      let [outside, inside] = [66, 67];
      for (let step = 0; step < 50; step += 1) {
        const middle = (outside + inside) / 2;
        if (natalChart({ utc, latitude: sign * middle, longitude, houseSystem }).flags.includes(flag as never)) inside = middle;
        else outside = middle;
      }
      return inside;
    };
    const boundary = firstLatitudeWith("polar-fallback", "placidus", 1);
    const formula = 90 - trueObliquity(new Date(utc));
    largest("polar", "boundaryMinusFormulaMaxArcsec", arcsec(boundary - formula));
    note("polar", `boundaryDegrees ${utc}`, Number(boundary.toFixed(6)));
    expect(arcsec(boundary - formula), `${id}: ${boundary} against ${formula}`).toBeLessThan(0.5);
    // Koch falls back at the same latitude, the south mirrors the north, and the angles' own flag begins there too.
    expect(firstLatitudeWith("polar-fallback", "koch", 1), id).toBe(boundary);
    expect(firstLatitudeWith("polar-fallback", "placidus", -1), id).toBe(boundary);
    expect(firstLatitudeWith("polar-angles", "whole", 1), id).toBe(boundary);
  });

  it("returns no NaN from any house system at any latitude: a sweep of 26,208 charts", () => {
    const latitudes = [0, 23.4, 45, 60, 66, 66.5, 66.55, 66.5599, 66.561, 66.57, 66.6, 67, 70, 75, 80, 85, 89, 89.9, 89.99, 89.9999, 90];
    let charts = 0;
    let fallbacks = 0;
    for (const houseSystem of HOUSE_SYSTEMS) {
      for (const latitude of latitudes) {
        for (const sign of [1, -1]) {
          for (let step = 0; step < 48; step += 1) {
            const utc = new Date(Date.UTC(2000, 5, 21) + step * 1_800_000 + 7 * DAY_MS * (step % 5));
            const chart = natalChart({ utc, latitude: sign * latitude, longitude: 13.37, houseSystem });
            charts += 1;
            const numbers = [...chart.houses!.cusps, chart.angles!.asc, chart.angles!.mc, chart.angles!.dsc, chart.angles!.ic];
            if (!numbers.every(inCircle)) throw new Error(`${houseSystem} at ${sign * latitude}, ${utc.toISOString()}: ${numbers.join(" ")}`);
            if (chart.flags.includes("polar-fallback")) {
              fallbacks += 1;
              expect(chart.houses!.system).toBe("whole");
              expect(houseSystem === "placidus" || houseSystem === "koch").toBe(true);
            } else {
              expect(chart.houses!.system).toBe(houseSystem);
            }
            if (chart.houses!.system === "whole") expectWholeSign(chart, `${houseSystem} at ${sign * latitude}`);
          }
        }
      }
    }
    note("polar", "sweepCharts", charts);
    note("polar", "sweepFallbacks", fallbacks);
    expect(charts).toBe(26_208);
  }, 120_000);
});

describe("the Sun's ingresses", () => {
  const ingresses = casesOf("ingress");
  const sunAt = (ms: number) => positions(new Date(ms)).find((body) => body.body === "Sun")!;

  it.each(ingresses.map((entry) => [entry.id, entry] as const))("%s", (id, entry) => {
    const { longitude, from, to } = entry.input as { longitude: number; from: string; to: string };
    const found = searchLongitudeCrossings("Sun", longitude, from, to);
    expect(found.status, id).toBe("complete");
    if (found.status !== "complete") return;
    expect(found.flags, id).toEqual([]);
    expect(found.crossings, id).toHaveLength(1);
    const at = found.crossings[0]!.at.getTime();
    expect(found.crossings[0]!.retrograde, id).toBe(false);

    // The sign changes at that instant and at no other: a second before, the old sign; a second after, the new.
    const before = sunAt(at - 1000);
    const after = sunAt(at + 1000);
    expect(before.sign, id).toBe(SIGNS[(longitude / 30 + 11) % 12]);
    expect(after.sign, id).toBe(SIGNS[longitude / 30]);
    expect(before.degree, id).toBeGreaterThan(29.999);
    expect(after.degree, id).toBeLessThan(0.001);
    largest("ingress", "searchResidualMaxArcsec", arcsec(wrapDifference(sunAt(at).lon, longitude)));
    // So a chart for the minute before and one for the minute after carry different Sun signs.
    const minute = Math.floor(at / 60_000) * 60_000;
    const sunSign = (ms: number) => natalChart({ utc: new Date(ms) }).bodies.find((body) => body.body === "Sun")!.sign;
    expect(sunSign(minute), id).toBe(before.sign);
    expect(sunSign(minute + 60_000), id).toBe(after.sign);

    // The Sun's longitude only increases: hourly over the 12 days of the window.
    let previous = sunAt(Date.parse(from)).lon;
    for (let ms = Date.parse(from) + 3_600_000; ms <= Date.parse(to); ms += 3_600_000) {
      const now = sunAt(ms).lon;
      const hourly = wrapDifference(now, previous);
      expect(hourly, `${id} at ${new Date(ms).toISOString()}`).toBeGreaterThan(0.039);
      expect(hourly, `${id} at ${new Date(ms).toISOString()}`).toBeLessThan(0.043);
      previous = now;
    }

    // A published low-accuracy series, written out above, puts the Sun at the same degree at that instant.
    const coarse = arcsec(wrapDifference(meeusSun(new Date(at)), longitude));
    largest("ingress", "againstMeeusLowAccuracyMaxArcsec", coarse);
    expect(coarse, `${id}: Meeus's low-accuracy Sun`).toBeLessThan(36);

    if (typeof entry.expected.referenceUtc === "string") {
      const seconds = Math.abs(at - Date.parse(entry.expected.referenceUtc)) / 1000;
      note("ingress", `againstDe440BspSeconds ${id}`, Number(seconds.toFixed(3)));
      expect(seconds, `${id} against de440.bsp`).toBeLessThan(1);
    }

    // The same search on astronomy-engine, the source outside the pack's years and of the package's core entry.
    setDefaultEphemeris("astronomy-engine");
    try {
      const fallback = searchLongitudeCrossings("Sun", longitude, from, to);
      expect(fallback.status, id).toBe("complete");
      if (fallback.status === "complete") largest("ingress", "astronomyEngineMinusDe440MaxSeconds", Math.abs(fallback.crossings[0]!.at.getTime() - at) / 1000);
    } finally {
      setDefaultEphemeris("de440");
    }
  });

  it("counts them", () => {
    note("ingress", "cases", ingresses.length);
    expect(ingresses.length).toBeGreaterThanOrEqual(28);
  });
});

describe("leap days", () => {
  it.each(casesOf("leap-day").map((entry) => [entry.id, entry] as const))("%s", async (id, entry) => {
    const { form, value } = entry.input as { form: string; value: Record<string, string> };
    const run = async () => {
      if (form === "utc") return natalChart(value as never).input.utc;
      await prepareLocalTime(value.date!, value.timeZone!);
      return resolveLocalToUtc(value.date!, value.time!, value.timeZone!, value.calendar ? { calendar: value.calendar as never } : undefined).utc;
    };
    if (entry.expected.result === "RangeError") {
      await expect(run(), `${id}: ${entry.note}`).rejects.toBeInstanceOf(RangeError);
      return;
    }
    const utc = await run();
    if (typeof entry.expected.utc === "string") expect(utc.getTime(), id).toBe(Date.parse(entry.expected.utc));
    expectSane(natalChart({ utc }), id);
  });

  it("29 February 1900 of the Julian calendar is 13 March 1900 of the Gregorian, by Julian Day Number", () => {
    expect(julianDayNumber(1900, 2, 29, "julian")).toBe(julianDayNumber(1900, 3, 13, "gregorian"));
    expect(julianDayNumber(2000, 1, 1, "gregorian")).toBe(2451545);
  });

  it.each([1900, 2000, 2100])("the Sun moves one day's worth across the end of February %i, with or without a 29th", (year) => {
    // JavaScript's own calendar says which days exist; the Sun's daily motion in late February is about 1.00 degree.
    const sun = (ms: number) => positions(new Date(ms)).find((body) => body.body === "Sun")!.lon;
    const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
    expect(leap).toBe(year === 2000);
    let ms = Date.UTC(year, 1, 26);
    for (let day = 0; day < 6; day += 1, ms += DAY_MS) {
      const daily = wrapDifference(sun(ms + DAY_MS), sun(ms));
      expect(daily, `${new Date(ms).toISOString()}`).toBeGreaterThan(0.99);
      expect(daily, `${new Date(ms).toISOString()}`).toBeLessThan(1.02);
    }
  });
});

describe("an unknown birth time", () => {
  it.each(casesOf("unknown-time").map((entry) => [entry.id, entry] as const))("%s", async (id, entry) => {
    const input = entry.input as { date: string; timeZone: string; latitude: number; longitude: number };
    const expected = entry.expected as { moonSigns: number | null; sunSigns: number };
    await prepareLocalTime(input.date, input.timeZone);
    const tomorrow = new Date(Date.parse(`${input.date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
    await prepareLocalTime(tomorrow, input.timeZone);

    // No time given, a birthplace and Placidus asked for: the chart has no ascendant and no houses, and says why.
    const birth = resolveBirth({ ...input, houseSystem: "placidus" });
    expect(birth.timeKnown, id).toBe(false);
    const chart = natalChart(birth);
    expectSane(chart, id);
    expect(chart.flags, id).toContain("no-time");
    expect(chart.angles, `${id}: no rising sign without a time`).toBeNull();
    expect(chart.houses, `${id}: no houses without a time`).toBeNull();
    expect(chart.flags, id).not.toContain("polar-fallback");
    expect(JSON.stringify(chart.aspects), id).not.toMatch(/ASC|MC|Ascendant|Midheaven/u);

    // Which signs the Moon is in over that local date: null for `sign` when there are two.
    const candidates = moonSignCandidates(input.date, { timeZone: input.timeZone });
    const start = candidates.from.getTime();
    const end = candidates.to.getTime();
    expect(end - start, id).toBe(DAY_MS - 1);
    expect(moonSignsBetweenDetailed(candidates.from, candidates.to).value, id).toEqual(candidates.signs);
    const chartMoon = chart.bodies.find((body) => body.body === "Moon")!;
    expect(candidates.signs, id).toContain(chartMoon.sign);

    // The independent witness: the 24-term Moon above, at the day's two ends.
    const coarseStart = meeusMoon(candidates.from);
    const coarseEnd = meeusMoon(candidates.to);
    const engineMoon = (date: Date) => positions(date).find((body) => body.body === "Moon")!.lon;
    for (const [date, coarse] of [[candidates.from, coarseStart], [candidates.to, coarseEnd]] as const) {
      largest("unknownTime", "moonAgainst24TermSeriesMaxDegrees", Math.abs(wrapDifference(engineMoon(date), coarse)));
    }
    if (expected.moonSigns !== null) {
      expect(candidates.signs, `${id}: ${entry.note}`).toHaveLength(expected.moonSigns);
      expect(candidates.sign === null, `${id}: the Moon's sign is not given as certain when it is not`).toBe(expected.moonSigns === 2);
      const coarseSigns = Math.floor(coarseEnd / 30) === Math.floor(coarseStart / 30) ? 1 : 2;
      expect(coarseSigns, `${id}: the coarse series agrees on whether the Moon changes sign`).toBe(expected.moonSigns);
      // And it is far enough from a cusp at both ends for a tenth of a degree not to matter.
      for (const coarse of [coarseStart, coarseEnd]) expect(Math.min(coarse % 30, 30 - (coarse % 30)), id).toBeGreaterThan(0.5);
    }

    // The Sun: on an ingress day the Sun sign too depends on the time, and the crossing lies inside the date.
    const sunSign = (date: Date) => positions(date).find((body) => body.body === "Sun")!.sign;
    const sunSigns = sunSign(candidates.from) === sunSign(candidates.to) ? 1 : 2;
    expect(sunSigns, `${id}: ${entry.note}`).toBe(expected.sunSigns);
    expect(Math.floor(meeusSun(candidates.from) / 30) === Math.floor(meeusSun(candidates.to) / 30) ? 1 : 2, id).toBe(expected.sunSigns);
    if (expected.sunSigns === 2) {
      const cusp = 30 * SIGNS.indexOf(sunSign(candidates.to));
      const crossing = searchLongitudeCrossings("Sun", cusp, candidates.from, candidates.to);
      expect(crossing.status === "complete" && crossing.crossings.length, id).toBe(1);
    }
  });

  it("refuses a date with no time unless the time is declared unknown", () => {
    expect(() => natalChart({ utc: "1990-06-15" })).toThrow(/timeKnown: false/u);
    const chart = natalChart({ utc: "1990-06-15", timeKnown: false, latitude: 40.7128, longitude: -74.006 });
    expect(chart.flags).toContain("no-time");
    expect(chart.houses).toBeNull();
  });
});

describe("extreme years", () => {
  it.each(casesOf("extreme-year").map((entry) => [entry.id, entry] as const))("%s", (id, entry) => {
    const utc = entry.input.utc as string;
    const expected = entry.expected as { ephemeris: string; flags: string[] };
    const chart = natalChart({ utc, latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" });
    expectSane(chart, id);
    // No fallback is silent: the chart and each body name the ephemeris, and a flag says why it is not the pack.
    expect(chart.ephemeris.name, id).toBe(expected.ephemeris);
    for (const body of chart.bodies) expect(body.ephemeris, `${id} ${body.body}`).toBe(expected.ephemeris);
    for (const flag of expected.flags) expect(chart.flags, id).toContain(flag);
    expect(chart.flags.includes("outside-de440-span"), id).toBe(expected.ephemeris !== "jpl-de440");
    const year = new Date(utc).getUTCFullYear();
    if (year >= 1850 && year <= 2099) {
      const sun = chart.bodies.find((body) => body.body === "Sun")!;
      const coarse = arcsec(wrapDifference(sun.lon, meeusSun(new Date(utc))));
      largest("extremeYears", "sunAgainstMeeusLowAccuracyMaxArcsec", coarse);
      expect(coarse, `${id}: Meeus's low-accuracy Sun`).toBeLessThan(36);
      expect(Math.abs(wrapDifference(chart.bodies.find((body) => body.body === "Moon")!.lon, meeusMoon(new Date(utc)))), id).toBeLessThan(0.3);
    }
  });
});

describe("malformed input", () => {
  const revive = (value: unknown): unknown => {
    if (value === "__NaN__") return Number.NaN;
    if (value === "__Infinity__") return Number.POSITIVE_INFINITY;
    if (Array.isArray(value)) return value.map(revive);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, revive(entry)]));
    return value;
  };
  const call = (name: string, argument: unknown): unknown => {
    const list = argument as [never, never, never, never];
    if (name === "natalChart") return natalChart(argument as never);
    if (name === "positions") return positions(argument as never);
    if (name === "resolveBirth") return resolveBirth(argument as never);
    if (name === "resolveLocalToUtc") return resolveLocalToUtc(list[0], list[1], list[2]);
    if (name === "searchLongitudeCrossings") return searchLongitudeCrossings(list[0], list[1], list[2], list[3]);
    throw new Error(`no function ${name}`);
  };

  it.each(casesOf("malformed").map((entry) => [entry.id, entry] as const))("%s", (id, entry) => {
    const { function: name, argument } = entry.input as { function: string; argument: unknown };
    const run = () => call(name, revive(argument));
    if (entry.expected.result === "ok") {
      const result = run();
      everyNumberFinite(result, id);
      if (name === "natalChart") expectSane(result as NatalChart, id);
      if (id === "BAD-62") {
        expect((result as NatalChart).houses, id).toBeNull();
        expect((result as NatalChart).angles, id).toBeNull();
      }
      return;
    }
    // A refusal is an Error with a message that says what was wrong; nothing is computed from the bad value.
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect(thrown, `${id} (${entry.note}) was accepted`).toBeInstanceOf(entry.expected.result === "RangeError" ? RangeError : Error);
    expect((thrown as Error).message.length, id).toBeGreaterThan(10);
    expect((thrown as Error).message, id).not.toMatch(/undefined|NaN|\[object/u);
  });
});

describe("no hidden state", () => {
  it("gives the same chart twice, leaves its input alone, and is not changed by a fallback in between", () => {
    const input = Object.freeze({ utc: "1990-06-15T18:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" as const });
    const before = JSON.stringify(input);
    const first = JSON.stringify(natalChart(input));
    // A chart outside the pack's years, on astronomy-engine, and one refused, between the two.
    expect(natalChart({ utc: "1700-01-01T00:00:00Z" }).ephemeris.name).toBe("astronomy-engine");
    expect(() => natalChart({ utc: "garbage" })).toThrow(RangeError);
    expect(JSON.stringify(natalChart(input))).toBe(first);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.parse(first).ephemeris.name).toBe("jpl-de440");
  });
});

describe("measured against the stored references", () => {
  interface PositionVector { id: string; input: { body: string; jd_tt: number }; expected: { lon: number; lat: number } }
  interface AngleVector {
    id: string;
    kind: string;
    input: { jd_ut1: number; lat: number; lon: number; system?: string };
    expected: { asc?: number; mc?: number; cusps?: number[]; status?: string };
  }
  const l1 = (json("../conformance/vectors/L1-positions.json") as unknown as { vectors: PositionVector[] }).vectors;
  const l2 = (json("../conformance/vectors/L2-houses-angles.json") as unknown as { vectors: AngleVector[] }).vectors;

  it.each(["de440", "astronomy-engine"] as const)("positions on %s, against JPL Horizons (DE441) at the 240 vectors of L1", (source) => {
    setDefaultEphemeris(source);
    try {
      const section = source === "de440" ? "positionsDe440" : "positionsAstronomyEngine";
      let within = 0;
      for (const vector of l1) {
        const chart = natalChart({ utc: dateOfJd(vector.input.jd_tt), timeScale: "tt", timeKnown: false });
        const body = chart.bodies.find((candidate) => candidate.body === vector.input.body)!;
        const lon = arcsec(wrapDifference(body.lon, vector.expected.lon));
        const lat = arcsec(body.lat - vector.expected.lat);
        largest(section, `${vector.input.body} lonMaxArcsec`, lon);
        largest(section, `${vector.input.body} latMaxArcsec`, lat);
        largest(section, "allBodiesMaxArcsec", Math.max(lon, lat));
        if (lon <= 1 && lat <= 1) within += 1;
      }
      note(section, "vectors", l1.length);
      note(section, "vectorsWithinOneArcsec", within);
      expect(l1).toHaveLength(240);
      // The default source is held to a tenth of an arcsecond at every vector; the fallback is only reported.
      if (source === "de440") expect(measured[section]!.allBodiesMaxArcsec as number).toBeLessThan(0.1);
    } finally {
      setDefaultEphemeris("de440");
    }
  });

  it("angles and house cusps, against the vectors of L2, with the polar ones apart", () => {
    const chartAt = (vector: AngleVector, houseSystem: HouseSystem) =>
      natalChart({ utc: dateOfJd(vector.input.jd_ut1), timeScale: "ut1", latitude: vector.input.lat, longitude: vector.input.lon, houseSystem });
    let cuspVectors = 0;
    let undefinedVectors = 0;
    let angleVectors = 0;
    for (const vector of l2) {
      const polar = Math.abs(vector.input.lat) >= 66.5 ? "Polar" : "";
      if (vector.kind === "angles.asc-mc") {
        const chart = chartAt(vector, "porphyry");
        angleVectors += 1;
        largest("anglesAndCusps", `ascMaxArcsec${polar}`, arcsec(wrapDifference(chart.angles!.asc, vector.expected.asc!)));
        largest("anglesAndCusps", `mcMaxArcsec${polar}`, arcsec(wrapDifference(chart.angles!.mc, vector.expected.mc!)));
      } else if (vector.kind === "houses.cusps") {
        const system = (vector.input.system === "whole-sign" ? "whole" : vector.input.system) as HouseSystem;
        const chart = chartAt(vector, system);
        expectSane(chart, vector.id);
        if (vector.expected.status === "undefined") {
          // The arbiter says these cusps do not exist; the engine must say so too, not invent twelve numbers.
          undefinedVectors += 1;
          expect(chart.flags, vector.id).toContain("polar-fallback");
          expect(chart.houses!.system, vector.id).toBe("whole");
        } else {
          cuspVectors += 1;
          expect(chart.flags, vector.id).not.toContain("polar-fallback");
          vector.expected.cusps!.forEach((cusp, index) => {
            const error = arcsec(wrapDifference(chart.houses!.cusps[index]!, cusp));
            largest("anglesAndCusps", `cuspMaxArcsec${polar}`, error);
            largest("anglesAndCusps", `cuspMaxArcsec ${system}`, error);
          });
        }
      }
    }
    note("anglesAndCusps", "angleVectors", angleVectors);
    note("anglesAndCusps", "cuspVectors", cuspVectors);
    note("anglesAndCusps", "undefinedCuspVectors", undefinedVectors);
    expect(measured.anglesAndCusps!.cuspMaxArcsec as number).toBeLessThan(1);
    expect(measured.anglesAndCusps!.ascMaxArcsec as number).toBeLessThan(1);
    expect(measured.anglesAndCusps!.mcMaxArcsec as number).toBeLessThan(1);
  });
});

describe("the measured file", () => {
  it("is written on request, and otherwise matches this run", () => {
    const rounded = JSON.parse(JSON.stringify(measured, (_key, value: unknown) => (typeof value === "number" ? Number(value.toPrecision(6)) : value))) as typeof measured;
    if (process.env.ADVERSARIAL_WRITE === "1") {
      const sorted = Object.fromEntries(Object.keys(rounded).sort().map((section) => [section, Object.fromEntries(Object.entries(rounded[section]!).sort(([a], [b]) => a.localeCompare(b)))]));
      writeFileSync(MEASURED_PATH, `${JSON.stringify({ schema: "zodiacs.adversarial-astronomy.measured.v1", about: "Written by tests/adversarial-astronomy.spec.ts with ADVERSARIAL_WRITE=1; do not edit by hand.", measured: sorted }, null, 1)}\n`);
      return;
    }
    expect(existsSync(MEASURED_PATH), "run once with ADVERSARIAL_WRITE=1").toBe(true);
    const committed = (json("./fixtures/adversarial-astronomy.measured.json") as unknown as { measured: typeof measured }).measured;
    expect(Object.keys(rounded).sort()).toEqual(Object.keys(committed).sort());
    for (const [section, values] of Object.entries(committed)) {
      for (const [key, value] of Object.entries(values)) {
        const now = rounded[section]![key];
        // What the host's Intl answers for a zone it has no history of is the host's, and is reported, not held.
        if (key.startsWith("intlWithoutBackzone")) continue;
        if (typeof value === "number" && typeof now === "number") {
          // The same to a part in 10,000, or to a millionth where the value is nearly nothing.
          expect(Math.abs(now - value), `${section} ${key}: ${now} against ${value}`).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(value) * 1e-4));
        } else {
          expect(now, `${section} ${key}`).toEqual(value);
        }
      }
    }
  });
});
