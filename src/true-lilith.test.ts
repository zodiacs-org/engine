/**
 * True Black Moon Lilith, the osculating lunar apogee (src/points.ts), from
 * 3.0.0: in chartPoints() and in calc().
 *
 * The arbiter is not this engine: 12 geometric geocentric state vectors of
 * the Moon from NASA JPL Horizons (DE441), position and velocity in the ICRF,
 * at Julian dates from 2396758.5 to 2506331.5 TDB, 1850 to 2150
 * (src/fixtures/moon-states-horizons-12.json, which records the query). The
 * apogee of each is found here by a second route, through the orbit's
 * classical elements, and carried to the true ecliptic and equinox of date
 * with the IAU 2006/2000B matrix of src/de440/frames.ts, frame bias included.
 * The engine's own route is the eccentricity vector, carried with
 * src/frame.ts, which leaves out the frame bias.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { calc } from "./calc.js";
import { useDe440 } from "./de440-pack.js";
import { apply, eclipticLonLatDeg, equToEcl, npbMatrix } from "./de440/frames.js";
import { tdbMinusTt } from "./de440/reduce.js";
import { chartPoints, natalChart, setDefaultEphemeris, withEphemeris } from "./index.js";
import { profectionAt, profectionYear, solarArcDirections } from "./timing.js";
import { trueApogee } from "./ephemeris.js";
import { EARTH_MOON_GM, osculatingApogee } from "./points.js";
import type { PointPosition, PositionSource } from "./types.js";

interface Row {
  jdTdb: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}
type Vec3 = [number, number, number];

const fixture: { rows: Row[]; sha256: string } = JSON.parse(
  readFileSync(new URL("./fixtures/moon-states-horizons-12.json", import.meta.url), "utf8")
);
const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** A Horizons instant, JD on TDB, as TT days from J2000.0 (TT = TDB less the three-term TDB − TT). */
const ttOf = (jdTdb: number): number => jdTdb - 2451545.0 - tdbMinusTt(jdTdb) / 86_400;
const ttDate = (ttDays: number): Date => new Date(J2000_MS + Math.round(ttDays * 86_400_000));
const at = (ttDays: number) => ({ utc: ttDate(ttDays), timeScale: "tt" as const, timeKnown: false });
/** a − b on the circle, arcseconds. */
const wrapArcsec = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360 - 180) * 3600;
const lilithOf = (points: readonly PointPosition[]): PointPosition | undefined => points.find((p) => p.point === "True Black Moon Lilith");
/** A document of the repository, its whitespace runs made single spaces. */
const documentText = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\s+/gu, " ");
/** The numbers `pattern` captures in `file`, or a failed test where it finds none. */
const quoted = (file: string, pattern: RegExp): number[] => {
  const found = pattern.exec(documentText(file));
  expect(found, `${file} quotes ${pattern}`).not.toBeNull();
  return found!.slice(1).map(Number);
};

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (v: Vec3): number => Math.sqrt(dot(v, v));

/** The gravitational parameter the definition names, written out here: GM of the Earth (IERS 2010) and of the Moon. */
const MU = 403503.2419;

/**
 * The apogee of the two-body orbit through (r, v), by the classical elements:
 * the node Ω and inclination i of the plane of h = r × v, the argument of
 * perigee ω from the node to the eccentricity vector, taken in its energy
 * form ((v² − μ/r) r − (r · v) v) / μ, and the apogee as the perifocal
 * direction at true anomaly 180°, R3(−Ω) R1(−i) R3(−(ω + 180°)) x̂.
 */
function keplerApogee(r: Vec3, v: Vec3): { direction: Vec3; eccentricity: number } {
  const h = cross(r, v);
  const rn = length(r);
  const e: Vec3 = [0, 1, 2].map((k) => ((dot(v, v) - MU / rn) * r[k]! - dot(r, v) * v[k]!) / MU) as Vec3;
  const i = Math.acos(h[2] / length(h));
  const node = Math.atan2(h[0], -h[1]);
  const n: Vec3 = [Math.cos(node), Math.sin(node), 0];
  // ω: from the node to e, positive in the direction of motion (towards h × n).
  const omega = Math.atan2(dot(cross(n, e), h) / length(h), dot(n, e));
  const u = omega + Math.PI;
  const direction: Vec3 = [
    Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(i),
    Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(i),
    Math.sin(u) * Math.sin(i)
  ];
  return { direction, eccentricity: length(e) };
}

/** An ICRF direction on the true ecliptic and equinox of date at TT days `tt`, with the IAU 2006/2000B matrix and the frame bias. */
const ofDate = (v: Vec3, tt: number): { lon: number; lat: number } => {
  const { matrix, epsTrue } = npbMatrix(tt / 36525);
  return eclipticLonLatDeg(equToEcl(apply(matrix, v), epsTrue));
};

/** Each Horizons state's apogee on the ecliptic of date, by the classical route. */
const arbiter = fixture.rows.map((row) => {
  const tt = ttOf(row.jdTdb);
  const kepler = keplerApogee([row.x, row.y, row.z], [row.vx, row.vy, row.vz]);
  return { row, tt, ...kepler, place: ofDate(kepler.direction, tt) };
});

/** The largest and the median of a list of magnitudes. */
const stats = (values: number[]): { max: number; median: number } => {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return { max: sorted.at(-1)!, median: sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2 };
};

afterEach(() => setDefaultEphemeris("astronomy-engine"));

describe("the osculating apogee", () => {
  it("is the classical elements' apogee of each of the 12 Horizons states, to rounding", () => {
    expect(fixture.rows).toHaveLength(12);
    expect(EARTH_MOON_GM).toBe(MU);
    expect(MU).toBeCloseTo(398600.4418 + 4902.8001, 9);
    // The Moon's GM is DE440's, 4,902.800118, whose ratio to DE440's GM of the Earth, 398,600.435507, is the
    // Earth-Moon mass ratio the shipped pack's header carries, 81.30056822149722, to nine digits.
    expect(Math.abs(398600.435507 / 4902.800118 / 81.30056822149722 - 1)).toBeLessThan(1e-9);
    expect(4902.800118).toBeCloseTo(4902.8001, 4);
    for (const { row, direction, eccentricity } of arbiter) {
      const got = osculatingApogee([row.x, row.y, row.z], [row.vx, row.vy, row.vz]);
      // The angle between the two routes' directions, radians: under 1e-12 (0.2 microarcseconds).
      const apart = Math.atan2(length(cross(got.direction, direction)), dot(got.direction, direction));
      expect(apart).toBeLessThan(1e-12);
      expect(got.eccentricity).toBeCloseTo(eccentricity, 12);
      // The Moon's osculating eccentricity at these instants: 0.030 to 0.075.
      expect(eccentricity).toBeGreaterThan(0.025);
      expect(eccentricity).toBeLessThan(0.08);
      // The apogee lies in the orbit's plane.
      const h = cross([row.x, row.y, row.z], [row.vx, row.vy, row.vz]);
      expect(Math.abs(dot(got.direction, h)) / length(h)).toBeLessThan(1e-14);
    }
  });

  it("is carried to the ecliptic of date without the frame bias, which moves it by under 0.03 arcseconds", () => {
    // src/frame.ts (astronomy-engine's IAU 2006 precession and the engine's nutation, no frame bias) against the
    // IAU 2006/2000B matrix with the frame bias, at the 12 instants: at most 0.0085 arcseconds in longitude as
    // measured on this build.
    for (const { row, tt, place } of arbiter) {
      const got = trueApogee([row.x, row.y, row.z], [row.vx, row.vy, row.vz], tt);
      expect(Math.abs(wrapArcsec(got.lon, place.lon))).toBeLessThan(0.03);
      expect(Math.abs(got.lat - place.lat) * 3600).toBeLessThan(0.03);
    }
  });
});

describe("chartPoints' True Black Moon Lilith", () => {
  it("on the shipped DE440 pack is Horizons's to 1.59 arcseconds at each of the 12 instants", () => {
    useDe440();
    const lon: number[] = [];
    const lat: number[] = [];
    for (const { tt, place } of arbiter) {
      const lilith = lilithOf(chartPoints(at(tt)).points)!;
      expect(lilith.ephemeris).toBe("jpl-de440");
      expect(lilith.fallback).toBeUndefined();
      lon.push(wrapArcsec(lilith.lon, place.lon) * Math.cos((place.lat * Math.PI) / 180));
      lat.push((lilith.lat - place.lat) * 3600);
    }
    // Measured on this build, arcseconds: longitude (times the cosine of the latitude) median 0.04864, largest
    // 1.58961, at JD 2451545.0 TDB; latitude median 0.01685, largest 0.07631.
    // README.md and docs/guide.md quote the 1.59, docs/calc.md and SKILL.md the 1.6.
    expect(stats(lon).max).toBeLessThan(1.59);
    expect(stats(lat).max).toBeLessThan(0.1);
    // What the documents quote is the measurement rounded outward, never under it.
    const [readmeLargest, readmeMedian] = quoted("README.md", /it is within ([0-9.]+)″ after `useDe440\(\)` \(median ([0-9.]+)″\)/u);
    const [guideLargest, guideMedian, guideLatitude] = quoted("docs/guide.md", /within ([0-9.]+)″ on the sky in longitude \(median ([0-9.]+)″\) and ([0-9.]+)″ in latitude/u);
    for (const largest of [readmeLargest!, guideLargest!]) expect(largest).toBeGreaterThanOrEqual(stats(lon).max);
    for (const median of [readmeMedian!, guideMedian!]) expect(median).toBeGreaterThanOrEqual(stats(lon).median);
    expect(guideLatitude).toBeGreaterThanOrEqual(stats(lat).max);
  });

  it("on astronomy-engine, the default, is Horizons's to 397 arcseconds at each of the 12 instants", () => {
    const lon: number[] = [];
    const lat: number[] = [];
    for (const { tt, place } of arbiter) {
      const lilith = lilithOf(chartPoints(at(tt)).points)!;
      expect(lilith.ephemeris).toBe("astronomy-engine");
      expect("fallback" in lilith).toBe(false);
      lon.push(wrapArcsec(lilith.lon, place.lon) * Math.cos((place.lat * Math.PI) / 180));
      lat.push((lilith.lat - place.lat) * 3600);
    }
    // Measured on this build, arcseconds: longitude median 178.110, largest 396.105 (0.11 degrees); latitude median
    // 9.334, largest 25.451. astronomy-engine's Moon is a truncated series, whose small errors in the velocity the
    // eccentricity vector, about 0.055 long, magnifies.
    // README.md and docs/guide.md quote the 397, docs/calc.md and SKILL.md the 400 (6.7 arcminutes).
    expect(stats(lon).max).toBeLessThan(397);
    expect(stats(lat).max).toBeLessThan(30);
    // What the documents quote is the measurement rounded outward, never under it.
    const [readmeLargest] = quoted("README.md", /and within ([0-9.]+)″ on the default astronomy-engine/u);
    const [guideLargest, guideMinutes, guideMedian] = quoted("docs/guide.md", /on astronomy-engine, the default, within ([0-9.]+)″ \(([0-9.]+)′; median ([0-9.]+)″\)/u);
    for (const largest of [readmeLargest!, guideLargest!, guideMinutes! * 60]) expect(largest).toBeGreaterThanOrEqual(stats(lon).max);
    expect(guideMedian).toBeGreaterThanOrEqual(stats(lon).median);
  });

  it("swings about the mean apogee, Black Moon Lilith, by under 32 degrees from 1800 to 2200", () => {
    let largest = 0;
    // Every 29.2 days from 1800 to 2200 (5,000 instants), on astronomy-engine: largest 30.2 degrees as measured on
    // this build, as at every 7.3 days (20,000 instants).
    for (let k = 0; k < 5_000; k += 1) {
      const tt = -73_048 + k * 29.2194;
      const points = chartPoints(at(tt)).points;
      const mean = points.find((p) => p.point === "Black Moon Lilith")!;
      const lilith = lilithOf(points)!;
      largest = Math.max(largest, Math.abs(wrapArcsec(lilith.lon, mean.lon)) / 3600);
      expect(Math.abs(lilith.lat)).toBeLessThan(5.4);
    }
    expect(largest).toBeLessThan(32);
  });

  it("comes last, after the points of 2.x, with and without angles, and labels itself", () => {
    const untimed = chartPoints({ utc: "1990-05-03T12:00:00Z", timeKnown: false }).points;
    expect(untimed.map((p) => p.point)).toEqual(["Mean Node", "Mean South Node", "Black Moon Lilith", "True Black Moon Lilith"]);
    const timed = chartPoints({ utc: "1990-05-03T12:00:00Z", latitude: 51.5, longitude: -0.1, houseSystem: "placidus" }).points;
    expect(timed.at(-1)!.point).toBe("True Black Moon Lilith");
    expect(timed.slice(0, -1).map((p) => p.point)).toEqual([
      "Mean Node",
      "Mean South Node",
      "Black Moon Lilith",
      "Vertex",
      "East Point",
      "Lot of Fortune",
      "Lot of Spirit",
      "Lot of Eros",
      "Lot of Necessity",
      "Lot of Courage",
      "Lot of Victory",
      "Lot of Nemesis"
    ]);
    // Only True Black Moon Lilith reads an ephemeris, so only it names one.
    expect(timed.slice(0, -1).every((p) => !("ephemeris" in p) && !("fallback" in p))).toBe(true);
    expect(timed.at(-1)!.ephemeris).toBe("astronomy-engine");
  });

  it("has a speed that is the rate of its longitude, on both sources", () => {
    for (const pack of [false, true]) {
      if (pack) useDe440();
      // Every 1.37 days over two months: the speed, over plus/minus 0.25 day, against a central difference over
      // plus/minus one hour of the longitudes chartPoints gives. Largest difference measured on this build: 0.0054
      // degrees a day on the pack and 0.0056 on astronomy-engine, where the speed ranges from about -2.8 to 4.3.
      let largest = 0;
      for (let k = 0; k < 45; k += 1) {
        const tt = 9000 + k * 1.37;
        const lilith = lilithOf(chartPoints(at(tt)).points)!;
        const before = lilithOf(chartPoints(at(tt - 1 / 24)).points)!;
        const after = lilithOf(chartPoints(at(tt + 1 / 24)).points)!;
        const rate = wrapArcsec(after.lon, before.lon) / 3600 / (2 / 24);
        largest = Math.max(largest, Math.abs(lilith.speed! - rate));
      }
      expect(largest).toBeLessThan(0.01);
    }
  });

  it("on the shipped pack outside its years falls back to astronomy-engine and says so", () => {
    useDe440();
    const lilith = lilithOf(chartPoints({ utc: "1700-01-01T00:00:00Z", timeKnown: false }).points)!;
    expect(lilith.ephemeris).toBe("astronomy-engine");
    expect(lilith.fallback).toBe("outside-de440-span");
  });

  it("comes from the source withEphemeris installs, and is left out where that source gives no Moon state", () => {
    const de440 = useDe440();
    setDefaultEphemeris("astronomy-engine");
    const withoutMoon: PositionSource = {
      ephemeris: { name: "test-source", version: "1" },
      place: (body, ttDays, behind) => de440.place(body, ttDays, behind),
      trueNode: (ttDays) => de440.trueNode(ttDays)
    };
    const withMoon: PositionSource = { ...withoutMoon, moonState: (ttDays) => de440.moonState(ttDays) };
    const input = at(arbiter[3]!.tt);
    expect(lilithOf(withEphemeris(withoutMoon, () => chartPoints(input)).points)).toBeUndefined();
    const named = lilithOf(withEphemeris(withMoon, () => chartPoints(input)).points)!;
    expect(named.ephemeris).toBe("test-source");
    useDe440();
    expect(named.lon).toBe(lilithOf(chartPoints(input).points)!.lon);
  });
});

describe("timing results from True Black Moon Lilith", () => {
  // 1790-01-02T00:00:00Z is the shipped pack's first TT instant as the default takes it (fromTtDays -76,699.5, a day
  // inside the pack's first day). On the engine's ΔT model the birth's TT is after it, so the pack computes the chart;
  // a ΔT pinned at -60 s puts the chart's TT, and its True Black Moon Lilith, a minute before it, on astronomy-engine.
  const birth = { utc: "1790-01-02T00:00:00Z", latitude: 51.5, longitude: -0.1, houseSystem: "placidus" } as const;
  const pinned = { ...birth, deltaT: -60 };
  const FALLBACK = "outside-de440-span";

  it("carry the point's fallback where a pinned ΔT puts the chart outside the pack and the birth's UTC instant is inside", () => {
    useDe440();
    expect(natalChart(birth).ephemeris?.name).toBe("jpl-de440");
    const chart = natalChart(pinned);
    expect(chart.ephemeris?.name).toBe("astronomy-engine");
    const lilith = lilithOf(chartPoints(chart).points)!;
    expect(lilith.ephemeris).toBe("astronomy-engine");
    expect(lilith.fallback).toBe(FALLBACK);

    const year = profectionYear(chart, 1, { point: "True Black Moon Lilith" });
    expect(year.origin.point).toBe("True Black Moon Lilith");
    expect(year.flags).toContain(FALLBACK);
    expect(profectionAt(chart, "1791-06-01T00:00:00Z", { point: "True Black Moon Lilith" }).flags).toContain(FALLBACK);
    const directed = solarArcDirections(chart, "1800-01-01T00:00:00Z");
    expect(directed.positions.some((row) => row.name === "True Black Moon Lilith")).toBe(true);
    expect(directed.flags).toContain(FALLBACK);
    // The arc itself is read at the birth and the progressed instant as UTC instants, which the pack covers.
    expect(directed.arc.flags).not.toContain(FALLBACK);
    // A point that reads no ephemeris carries no fallback: the Ascendant, from the instant and the place alone.
    expect(profectionYear(chart, 1, { point: "Ascendant" }).flags).not.toContain(FALLBACK);
  });

  it("carry the point's own fallback from a supplied chart computed on astronomy-engine by choice", () => {
    // The chart names astronomy-engine, the default, with no fallback; after useDe440() the point is computed at
    // the call, on the chart's clock, outside the pack, and says so, as the timing results then do.
    const chart = natalChart(pinned);
    expect(chart.flags).not.toContain(FALLBACK);
    useDe440();
    expect(lilithOf(chartPoints(chart).points)!.fallback).toBe(FALLBACK);
    expect(profectionYear(chart, 1, { point: "True Black Moon Lilith" }).flags).toContain(FALLBACK);
    expect(solarArcDirections(chart, "1800-01-01T00:00:00Z").flags).toContain(FALLBACK);
    // The bodies are the chart's, computed on astronomy-engine by choice: no fallback.
    expect(profectionYear(chart, 1, { point: "Sun" }).flags).not.toContain(FALLBACK);
  });
});

describe("calc()'s True Black Moon Lilith", () => {
  const time = "1987-06-15T03:21:00Z";

  it("is chartPoints' to the bit, on astronomy-engine and on the pack, with its own convention id", () => {
    for (const pack of [false, true]) {
      if (pack) useDe440();
      const result = calc({ body: "True Black Moon Lilith", time });
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      const lilith = lilithOf(chartPoints({ utc: time, timeKnown: false }).points)!;
      expect(result.lon).toBe(lilith.lon);
      expect(result.lat).toBe(lilith.lat);
      expect(result.speeds!.lon).toBe(lilith.speed);
      expect(result.dist).toBeNull();
      const ids = result.receipt.conventions;
      expect(ids).toContain("lilith:true-osculating");
      expect(ids).toContain("correction:not-applicable");
      expect(ids).toContain("speed:central-difference-0.25d");
      expect(ids).not.toContain("lilith:mean");
      expect(result.receipt.engine.ephemeris.name).toBe(pack ? "jpl-de440" : "astronomy-engine");
      // On the pack only the Moon's state is the pack's: it is carried to the ecliptic of date as on astronomy-engine.
      expect(ids.includes("time:tdb-three-term")).toBe(pack);
      expect(ids).not.toContain("place:icrf-to-true-ecliptic-of-date");
      expect(result.bounds.position.value).toBeNull();
      expect(result.bounds.position.basis).toMatch(/^not bounded: compared with the osculating apogee of JPL Horizons/u);
    }
  });

  it("is turned into the other frames as the mean apogee is, and refused where a point of the Moon's orbit is", () => {
    const icrs = calc({ body: "True Black Moon Lilith", time, frame: "equatorial-icrs" });
    expect(icrs.status).toBe("ok");
    const refused = (request: Parameters<typeof calc>[0]) => {
      const result = calc(request);
      return result.status === "refused" ? result.reason : null;
    };
    expect(refused({ body: "True Black Moon Lilith", time, center: "heliocentric" })).toBe("unsupported-combination");
    expect(refused({ body: "True Black Moon Lilith", time, flags: { cartesian: true } })).toBe("unsupported-combination");
  });
});

describe("the root's size with True Black Moon Lilith", () => {
  it("keeps natalChart and chartPoints, bundled from source for a browser and minified, under 40,000 bytes gzipped", async () => {
    // As scripts/dist-purity.mjs bundles the built root's natalChart (bundleOf), from src/ here, so that no build is
    // needed.
    const root = fileURLToPath(new URL("..", import.meta.url));
    const result = await build({
      stdin: {
        contents: 'import { natalChart, chartPoints } from "./src/index.ts";\nglobalThis.chart = [natalChart, chartPoints];\n',
        resolveDir: root,
        sourcefile: "application.js",
        loader: "js"
      },
      absWorkingDir: root,
      bundle: true,
      format: "esm",
      platform: "browser",
      minify: true,
      write: false,
      logLevel: "silent"
    });
    expect([...result.errors, ...result.warnings]).toEqual([]);
    // Measured on this build: 84,524 bytes, 37,400 gzipped (the built root's, as scripts/dist-purity.mjs bundles
    // it: 84,575 and 38,000).
    expect(gzipSync(result.outputFiles[0]!.contents, { level: 9 }).length).toBeLessThanOrEqual(40_000);
  });
});
