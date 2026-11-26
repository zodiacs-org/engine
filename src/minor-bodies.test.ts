/**
 * `@zodiacs/engine/minor-bodies` against an independent arbiter: 500 apparent
 * geocentric ecliptic-of-date places from NASA JPL Horizons's OBSERVER tables
 * (quantity 31, TT, airless), 100 for each of Chiron, Ceres, Pallas, Juno and
 * Vesta at instants drawn across 1800 to 2200 with a fixed seed, which the
 * fit never saw (src/fixtures/minor-bodies-horizons-oos.json, with each raw
 * response's SHA-256; scripts/minor-bodies/fetch-horizons.py fetched them).
 *
 * Horizons gives quantity 31 on its own ecliptic and equinox of date, whose
 * precession is not the IAU 2006 precession the engine takes, so part of each
 * longitude's difference is the two conventions': on the DE440 pack the
 * differences follow 0.020″ − 0.235″ T (T in Julian centuries from 2000),
 * 0.49″ at 1800 and −0.45″ at 2200, as measured on this build, and their
 * largest departure from that line is 0.1187″.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { shippedDe440Source, useDe440 } from "./de440-pack.js";
import { registerDe440Source } from "./ephemeris-default.js";
import { SIGN_SLUGS, natalChart, positions, setDefaultEphemeris, withEphemeris } from "./index.js";
import {
  MINOR_BODIES,
  MINOR_BODIES_PROVENANCE,
  MINOR_BODIES_SPAN,
  MINOR_BODY_NAMES,
  MINOR_BODY_SPEED_STEP_DAYS,
  ceres,
  chiron,
  juno,
  minorBodyPosition,
  minorBodyPositions,
  pallas,
  vesta
} from "./minor-bodies.js";
import type { MinorBodySpec } from "./minor-bodies.js";
import * as PACK from "./minor-bodies/pack-data.js";
import { table } from "./minor-bodies/table.js";
import type { PositionSource } from "./types.js";

interface Check {
  jdTt: number;
  lon: number;
  lat: number;
}
const fixture: { seed: number; observerParams: Record<string, string>; bodies: Record<string, { command: string; batchSha256: string[]; points: Check[] }> } =
  JSON.parse(readFileSync(new URL("./fixtures/minor-bodies-horizons-oos.json", import.meta.url), "utf8"));
const provenance = JSON.parse(readFileSync(new URL("./minor-bodies/provenance.json", import.meta.url), "utf8"));

const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** a − b on the circle, arcseconds. */
const wrapArcsec = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360 - 180) * 3600;
/** A TT Julian date as a Date read on TT, and the part of a millisecond it rounds away, days. */
const ttInstant = (jdTt: number): { date: Date; rest: number } => {
  const ms = (jdTt - 2451545.0) * 86_400_000;
  return { date: new Date(J2000_MS + Math.round(ms)), rest: (ms - Math.round(ms)) / 86_400_000 };
};
/** The pairs of bounds README.md, docs/guide.md and docs/calc.md quote for the 500 checks, after useDe440() and on astronomy-engine. */
const QUOTED_BOUNDS: readonly [string, RegExp][] = [
  ["README.md", /every longitude and latitude is within ([0-9.]+)″ after `useDe440\(\)` and within ([0-9.]+)″ on astronomy-engine/u],
  ["docs/guide.md", /every longitude and latitude is within ([0-9.]+)″ after `useDe440\(\)` and within ([0-9.]+)″ on astronomy-engine/u],
  ["docs/calc.md", /never saw it is within ([0-9.]+)″ after `useDe440\(\)` and ([0-9.]+)″ on astronomy-engine/u]
];
/** The bounds each document quotes, [after useDe440(), on astronomy-engine], or a failed test where one quotes none. */
const quotedBounds = (): number[][] =>
  QUOTED_BOUNDS.map(([file, pattern]) => {
    const found = pattern.exec(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\s+/gu, " "));
    expect(found, `${file} quotes the bounds`).not.toBeNull();
    return found!.slice(1).map(Number);
  });
const stats = (values: number[]): { median: number; max: number } => {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  return { median: (sorted[(sorted.length - 1) >> 1]! + sorted[sorted.length >> 1]!) / 2, max: sorted.at(-1)! };
};

/** Each check's difference from Horizons, arcseconds: the longitude's (the date's rounding moved by the speed) and the latitude's. */
function differences(spec: MinorBodySpec): { lon: number[]; lat: number[]; ephemeris: Set<string> } {
  const lon: number[] = [];
  const lat: number[] = [];
  const ephemeris = new Set<string>();
  for (const check of fixture.bodies[spec.name]!.points) {
    const { date, rest } = ttInstant(check.jdTt);
    const place = minorBodyPosition(spec, date, { timeScale: "tt" });
    lon.push(wrapArcsec(place.lon + place.speed * rest, check.lon));
    lat.push((place.lat - check.lat) * 3600);
    ephemeris.add(`${place.ephemeris.name}${place.flags.length ? ` ${place.flags.join(",")}` : ""}`);
  }
  return { lon, lat, ephemeris };
}

afterEach(() => setDefaultEphemeris("astronomy-engine"));

describe("the minor-body tables", () => {
  it("are the five bodies, with the fit's provenance", () => {
    expect(MINOR_BODY_NAMES).toEqual(["Chiron", "Ceres", "Pallas", "Juno", "Vesta"]);
    expect(MINOR_BODIES).toEqual([chiron, ceres, pallas, juno, vesta]);
    expect(MINOR_BODIES.map((spec) => spec.name)).toEqual(MINOR_BODY_NAMES);
    expect(MINOR_BODIES.map((spec) => spec.solution)).toEqual(["JPL#171", "JPL#48", "JPL#74", "JPL#144", "JPL#36"]);
    expect(Object.isFrozen(chiron) && Object.isFrozen(chiron.table) && Object.isFrozen(MINOR_BODIES)).toBe(true);
    expect(MINOR_BODIES_SPAN).toEqual({ from: "1800-01-01T00:00:00Z", to: "2200-01-01T00:00:00Z", fromJdTt: 2378496.5, toJdTt: 2524593.5 });
    // The constant is provenance.json's, which fetch-horizons.py wrote.
    for (const name of MINOR_BODY_NAMES) {
      const recorded = provenance.bodies[name];
      const given = MINOR_BODIES_PROVENANCE.bodies[name];
      expect(given).toEqual({ ...recorded, solution: /JPL#\d+/u.exec(recorded.solution)![0] });
      expect(MINOR_BODIES.find((spec) => spec.name === name)!.solution).toBe(given.solution);
    }
    expect(MINOR_BODIES_PROVENANCE.vectorParams).toEqual(provenance.vectorParams);
    expect(MINOR_BODIES_PROVENANCE.fetchedAtUtc).toBe(provenance.fetchedAtUtc);
    expect(Object.isFrozen(MINOR_BODIES_PROVENANCE.bodies.Chiron)).toBe(true);
  });

  it("hold the bytes their layouts describe, fitted to 206 km (Chiron) and 90 km (the others) at the fitted vectors", () => {
    for (const [name, base64, layout] of [
      ["Chiron", PACK.CHIRON_PACK, PACK.CHIRON_LAYOUT],
      ["Ceres", PACK.CERES_PACK, PACK.CERES_LAYOUT],
      ["Pallas", PACK.PALLAS_PACK, PACK.PALLAS_LAYOUT],
      ["Juno", PACK.JUNO_PACK, PACK.JUNO_LAYOUT],
      ["Vesta", PACK.VESTA_PACK, PACK.VESTA_LAYOUT]
    ] as const) {
      const bytes = Buffer.from(base64, "base64");
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(layout.sha256);
      const widths = Array.from({ length: layout.degree + 1 }, (_, k) => (k < layout.k32 ? 4 : k < layout.k8Start ? 2 : 1));
      expect(bytes.length).toBe(3 * layout.intervals * widths.reduce((sum, width) => sum + width, 0));
      expect(layout.intervals * layout.intervalDays).toBeCloseTo(layout.spanEndJd - layout.spanStartJd, 6);
      // Two days past each end of MINOR_BODIES_SPAN, for the light time and the speed's samples.
      expect([layout.spanStartJd, layout.spanEndJd]).toEqual([MINOR_BODIES_SPAN.fromJdTt - 2, MINOR_BODIES_SPAN.toJdTt + 2]);
      expect(layout.maxFitResidualKm).toBeLessThanOrEqual(name === "Chiron" ? 206 : 90);
    }
  });

  it("meet from one interval to the next to within 730 km for Chiron and 240 km for the others", () => {
    // Measured on this build: Chiron 728.0 km (mean 503.2), Ceres 128.1, Pallas 213.5, Juno 236.6, Vesta 132.7.
    for (const [name, base64, layout] of [
      ["Chiron", PACK.CHIRON_PACK, PACK.CHIRON_LAYOUT],
      ["Ceres", PACK.CERES_PACK, PACK.CERES_LAYOUT],
      ["Pallas", PACK.PALLAS_PACK, PACK.PALLAS_LAYOUT],
      ["Juno", PACK.JUNO_PACK, PACK.JUNO_LAYOUT],
      ["Vesta", PACK.VESTA_PACK, PACK.VESTA_LAYOUT]
    ] as const) {
      const reader = table(layout, base64);
      let largest = 0;
      for (let i = 1; i < layout.intervals; i += 1) {
        const at = layout.spanStartJd + i * layout.intervalDays;
        const [a, b] = [reader.position(at - 1e-9), reader.position(at + 1e-9)];
        largest = Math.max(largest, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      }
      expect(largest, name).toBeLessThan(name === "Chiron" ? 730 : 240);
    }
  });
});

describe("minor-body places against the 500 Horizons checks", () => {
  it("are within 1 arcsecond of Horizons at every check, on the shipped DE440 pack", () => {
    useDe440();
    const all: number[] = [];
    for (const spec of MINOR_BODIES) {
      const { lon, lat, ephemeris } = differences(spec);
      expect([...ephemeris]).toEqual(["jpl-de440"]);
      expect(lon).toHaveLength(100);
      for (const value of [...lon, ...lat]) expect(Math.abs(value), spec.name).toBeLessThan(1);
      all.push(...lon, ...lat);
    }
    // Measured on this build, arcseconds, longitude median and largest: Chiron 0.23336 and 0.52150, Ceres 0.23072
    // and 0.53211, Pallas 0.22605 and 0.51668, Juno 0.22761 and 0.52537, Vesta 0.23114 and 0.51561; latitude largest
    // 0.064971. README.md, docs/guide.md and docs/calc.md quote the 0.54.
    expect(stats(all).max).toBeLessThan(0.54);
    // What the documents quote is the measurement rounded outward, never under it.
    for (const [pack] of quotedBounds()) expect(pack).toBeGreaterThanOrEqual(stats(all).max);
  });

  it("follow Horizons's longitudes, on the pack, to 0.12 arcseconds once the two precessions' difference is taken out", () => {
    useDe440();
    const rows: { t: number; dl: number }[] = [];
    for (const spec of MINOR_BODIES) {
      const { lon } = differences(spec);
      fixture.bodies[spec.name]!.points.forEach((check, index) => rows.push({ t: (check.jdTt - 2451545.0) / 36525, dl: lon[index]! }));
    }
    const n = rows.length;
    const [sx, sy, sxx, sxy] = rows.reduce(([a, b, c, d], { t, dl }) => [a + t, b + dl, c + t * t, d + t * dl], [0, 0, 0, 0]);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    // 0.020 − 0.235 T arcseconds, as measured on this build.
    expect(intercept).toBeCloseTo(0.02, 2);
    expect(slope).toBeCloseTo(-0.235, 2);
    expect(Math.max(...rows.map(({ t, dl }) => Math.abs(dl - intercept - slope * t)))).toBeLessThan(0.12);
  });

  it("are within 5 arcseconds of Horizons at every check, on astronomy-engine, the default", () => {
    const all: number[] = [];
    for (const spec of MINOR_BODIES) {
      const { lon, lat, ephemeris } = differences(spec);
      expect([...ephemeris]).toEqual(["astronomy-engine"]);
      for (const value of [...lon, ...lat]) expect(Math.abs(value), spec.name).toBeLessThan(5);
      all.push(...lon, ...lat);
    }
    // Measured on this build, arcseconds, longitude median and largest: Chiron 0.22954 and 0.60927, Ceres 0.26181
    // and 1.06684, Pallas 0.30830 and 1.08525, Juno 0.29785 and 1.10138, Vesta 0.26295 and 1.68213; latitude
    // largest 1.48463. The Earth's place from astronomy-engine's truncated VSOP87 is most of it. README.md,
    // docs/guide.md and docs/calc.md quote the 1.7.
    expect(stats(all).max).toBeLessThan(1.7);
    // What the documents quote is the measurement rounded outward, never under it.
    for (const [, astronomyEngine] of quotedBounds()) expect(astronomyEngine).toBeGreaterThanOrEqual(stats(all).max);
  });

  it("take the checks from the raw responses whose digests the fixture records", () => {
    expect(fixture.seed).toBe(300001);
    expect(fixture.observerParams).toMatchObject({ EPHEM_TYPE: "OBSERVER", CENTER: "500@399", TIME_TYPE: "TT", QUANTITIES: "31", APPARENT: "AIRLESS" });
    for (const name of MINOR_BODY_NAMES) {
      const body = fixture.bodies[name]!;
      expect(body.points).toHaveLength(100);
      expect(body.batchSha256).toHaveLength(2);
      for (const digest of body.batchSha256) expect(digest).toMatch(/^[0-9a-f]{64}$/u);
      for (const check of body.points) {
        expect(check.jdTt).toBeGreaterThanOrEqual(MINOR_BODIES_SPAN.fromJdTt);
        expect(check.jdTt).toBeLessThanOrEqual(MINOR_BODIES_SPAN.toJdTt);
      }
    }
  });
});

describe("minor-body speeds", () => {
  it("are retrograde at every opposition and direct at every conjunction, 1800 to 2200", () => {
    // Every body here is outside the Earth's orbit, so seen from the Earth it moves backwards when it is opposite the
    // Sun and forwards when it is beyond the Sun. Every 36.5 days from 1800 to 2200 (4,000 instants), each instant
    // within 6 degrees of either elongation is checked: the Sun from positions() on the same source.
    let checked = 0;
    for (let k = 0; k < 4_000; k += 1) {
      const date = new Date(Date.UTC(1800, 0, 2) + k * 36.5 * 86_400_000);
      const sun = positions(date).find((row) => row.body === "Sun")!.lon;
      for (const place of minorBodyPositions(date)) {
        const elongation = Math.abs(wrapArcsec(place.lon, sun)) / 3600;
        if (elongation > 174) {
          expect(place.speed, `${place.body} at opposition on ${date.toISOString()}`).toBeLessThan(0);
          expect(place.retrograde).toBe(true);
          checked += 1;
        } else if (elongation < 6) {
          expect(place.speed, `${place.body} at conjunction on ${date.toISOString()}`).toBeGreaterThan(0);
          expect(place.retrograde).toBe(false);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("hold the central instant's side of the Sun's disc on both samples, so that a sample across the limb reads no step as motion", () => {
    // On the pack Vesta passes behind the Sun's disc at 2020-07-04T18:07:18 TT, where its place steps by about 1.2
    // arcseconds: its light is bent outside the disc and not behind it, as JPL Horizons does. A quarter of a day
    // earlier, at 12:07:18 TT, the speed's later sample crosses the limb. With each sample deciding its own side, the
    // speed stepped there by 2.44 arcseconds a day, as measured on the candidate's build before the fix; holding the
    // central instant's decision, it changes by at most 0.032 arcseconds a day in each 10 minutes from 11:07:18 to
    // 13:07:18 TT, the body's own acceleration, as measured on this build.
    useDe440();
    const center = Date.UTC(2020, 6, 4, 12, 7, 18);
    const speedAt = (ms: number): number => minorBodyPosition(vesta, new Date(ms), { timeScale: "tt" }).speed * 3600;
    let largest = 0;
    for (let k = -6; k < 6; k += 1) largest = Math.max(largest, Math.abs(speedAt(center + (k + 1) * 600_000) - speedAt(center + k * 600_000)));
    expect(largest).toBeLessThan(0.05);
    // The place itself steps where the central instant crosses the limb, a quarter of a day later.
    const place = (ms: number) => minorBodyPosition(vesta, new Date(ms), { timeScale: "tt" });
    const [before, after] = [place(center + 21_599_000), place(center + 21_601_000)];
    expect(Math.abs(wrapArcsec(after.lon, before.lon) - (before.speed * 3600 * 2_000) / 86_400_000)).toBeGreaterThan(1);
  });

  it("are the rate of the longitude over half a day of TT", () => {
    const date = new Date("1990-05-03T12:00:00Z");
    const place = minorBodyPosition(ceres, date);
    const step = MINOR_BODY_SPEED_STEP_DAYS * 86_400_000;
    const [before, after] = [-step, step].map((offset) => minorBodyPosition(ceres, new Date(date.getTime() + offset)).lon);
    expect(MINOR_BODY_SPEED_STEP_DAYS).toBe(0.25);
    // UTC has no leap second here, so half a day of UTC is half a day of TT.
    expect(place.speed).toBeCloseTo(wrapArcsec(after!, before!) / 3600 / (2 * MINOR_BODY_SPEED_STEP_DAYS), 9);
  });
});

describe("minor-body positions", () => {
  it("label the Earth's ephemeris and the body's table, and read the instant as a chart reads it", () => {
    const place = minorBodyPosition(chiron, "1990-05-03T12:00:00Z");
    expect(place.body).toBe("Chiron");
    expect(place.ephemeris).toEqual({ name: "astronomy-engine", version: "2.1.19", body: { name: "jpl-horizons", solution: "JPL#171", sha256: PACK.CHIRON_LAYOUT.sha256 } });
    expect(place.flags).toEqual([]);
    expect(place.lon).toBeGreaterThanOrEqual(0);
    expect(place.lon).toBeLessThan(360);
    expect(place.sign).toBe(SIGN_SLUGS[Math.floor(place.lon / 30)]);
    expect(place.degree).toBeCloseTo(place.lon % 30, 12);
    // Chiron's orbit keeps it 7 to 20 au from the Earth.
    expect(place.dist).toBeGreaterThan(7);
    expect(place.dist).toBeLessThan(20);
    // An instant on TT and the same instant on UTC give one place.
    // TT − UTC was 57.184 s in 1990: 25 leap seconds and 32.184 s.
    const tt = new Date(Date.parse("1990-05-03T12:00:00Z") + 57_184);
    expect(minorBodyPosition(chiron, tt, { timeScale: "tt" }).lon).toBeCloseTo(place.lon, 10);
  });

  it("follow the default source: the pack after useDe440(), and astronomy-engine, flagged, where the pack is not to be had", () => {
    const date = "2001-02-03T04:05:06Z";
    try {
      // A pack that cannot be opened, and one whose coverage leaves the instant out.
      registerDe440Source(() => {
        throw new Error("no pack");
      });
      setDefaultEphemeris("de440");
      const unavailable = minorBodyPosition(vesta, date);
      expect([unavailable.ephemeris.name, ...unavailable.flags]).toEqual(["astronomy-engine", "de440-unavailable"]);
      const real = shippedDe440Source();
      registerDe440Source(() => ({ ...real, pack: { ...real.pack, startEtSecTdb: 0, stopEtSecTdb: 864_000 } }));
      const outside = minorBodyPosition(vesta, date);
      expect([outside.ephemeris.name, ...outside.flags]).toEqual(["astronomy-engine", "outside-de440-span"]);
      expect(outside.lon).toBe(unavailable.lon);
    } finally {
      registerDe440Source(shippedDe440Source);
    }
    useDe440();
    const packed = minorBodyPosition(vesta, date);
    expect(packed.ephemeris.name).toBe("jpl-de440");
    expect(packed.flags).toEqual([]);
    setDefaultEphemeris("astronomy-engine");
    const plain = minorBodyPosition(vesta, date);
    expect(plain.ephemeris.name).toBe("astronomy-engine");
    expect(plain.flags).toEqual([]);
    // The two Earths agree to a few arcseconds.
    expect(Math.abs(wrapArcsec(packed.lon, plain.lon))).toBeLessThan(5);
  });

  it("take the Earth from the source withEphemeris installs, and refuse one that gives no Earth state", () => {
    const de440 = useDe440();
    setDefaultEphemeris("astronomy-engine");
    const date = "1950-07-01T00:00:00Z";
    const inside = withEphemeris(de440, () => minorBodyPosition(pallas, date));
    expect(inside.ephemeris.name).toBe("jpl-de440");
    useDe440();
    expect(inside.lon).toBe(minorBodyPosition(pallas, date).lon);
    setDefaultEphemeris("astronomy-engine");
    const bare: PositionSource = { ephemeris: { name: "test-source", version: "1" }, place: (body, t) => de440.place(body, t), trueNode: (t) => de440.trueNode(t) };
    expect(() => withEphemeris(bare, () => minorBodyPosition(pallas, date))).toThrow(TypeError);
  });

  it("refuse instants outside 1800 to 2200 TT, never extrapolating", () => {
    for (const date of ["1799-12-31T00:00:00Z", "2200-01-02T00:00:00Z", "1700-06-01T00:00:00Z", "2500-01-01T00:00:00Z"]) {
      expect(() => minorBodyPosition(juno, date)).toThrow(RangeError);
      expect(() => minorBodyPositions(date)).toThrow(RangeError);
    }
    // The ends, on TT, are inside.
    expect(minorBodyPosition(juno, "1800-01-01T00:00:00Z", { timeScale: "tt" }).body).toBe("Juno");
    expect(minorBodyPosition(juno, "2200-01-01T00:00:00Z", { timeScale: "tt" }).body).toBe("Juno");
    expect(() => minorBodyPosition(juno, "1799-12-31T23:59:59Z", { timeScale: "tt" })).toThrow(/not extrapolated/u);
  });

  it("take specs, and names in minorBodyPositions, and refuse anything else", () => {
    const date = "2020-01-01T00:00:00Z";
    expect(minorBodyPositions(date).map((place) => place.body)).toEqual(MINOR_BODY_NAMES);
    expect(minorBodyPositions(date, ["Vesta", ceres]).map((place) => place.body)).toEqual(["Vesta", "Ceres"]);
    expect(minorBodyPositions(date, ["Vesta"])[0]!.lon).toBe(minorBodyPosition(vesta, date).lon);
    expect(() => minorBodyPositions(date, ["Eris" as never])).toThrow(RangeError);
    expect(() => minorBodyPosition("Chiron" as never, date)).toThrow(TypeError);
    expect(() => minorBodyPosition({ ...chiron }, date)).toThrow(TypeError);
    expect(() => minorBodyPosition(chiron, date, { timescale: "tt" } as never)).toThrow(RangeError);
    expect(() => minorBodyPosition(chiron, date, { timeScale: "tdb" as never })).toThrow(RangeError);
    expect(() => minorBodyPosition(chiron, "not a date")).toThrow(RangeError);
  });
});

describe("the minor-bodies entry's size", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  /** An application's bundle, from source, for a browser and minified, as scripts/dist-purity.mjs bundles one: bytes, gzipped bytes and its modules. */
  const bundled = async (contents: string) => {
    const result = await build({
      stdin: { contents, resolveDir: root, sourcefile: "application.js", loader: "js" },
      absWorkingDir: root,
      bundle: true,
      format: "esm",
      platform: "browser",
      minify: true,
      write: false,
      metafile: true,
      logLevel: "silent"
    });
    expect([...result.errors, ...result.warnings]).toEqual([]);
    const text = result.outputFiles[0]!.text;
    return { text, gzip: gzipSync(text, { level: 9 }).length, inputs: Object.keys(result.metafile.inputs) };
  };
  const natal = 'import { natalChart } from "./src/index.ts";\n';

  it("adds Chiron alone to an application of the root under 15,000 bytes gzipped, and all five under 140,000", async () => {
    const base = await bundled(`${natal}globalThis.chart = natalChart;\n`);
    const one = await bundled(`${natal}import { chiron, minorBodyPosition } from "./src/minor-bodies.ts";\nglobalThis.chart = [natalChart, minorBodyPosition(chiron, new Date())];\n`);
    const five = await bundled(`${natal}import * as minor from "./src/minor-bodies.ts";\nglobalThis.chart = [natalChart, minor];\n`);
    // Measured on this build, gzipped: 35,622 for natalChart; Chiron adds 14,204, all five 117,805.
    expect(one.gzip - base.gzip).toBeLessThanOrEqual(15_000);
    expect(five.gzip - base.gzip).toBeLessThanOrEqual(140_000);
    // Chiron's bundle holds its own table and no other.
    expect(one.text).toContain(PACK.CHIRON_PACK.slice(0, 200));
    for (const other of [PACK.CERES_PACK, PACK.PALLAS_PACK, PACK.JUNO_PACK, PACK.VESTA_PACK]) expect(one.text).not.toContain(other.slice(0, 200));
  });

  it("is in no part of the root's graph", async () => {
    const whole = await bundled('import * as engine from "./src/index.ts";\nglobalThis.engine = engine;\n');
    expect(whole.inputs.filter((path) => /^src\/minor-bodies/u.test(path))).toEqual([]);
    for (const base64 of [PACK.CHIRON_PACK, PACK.CERES_PACK, PACK.PALLAS_PACK, PACK.JUNO_PACK, PACK.VESTA_PACK]) {
      expect(whole.text).not.toContain(base64.slice(0, 200));
    }
  });
});
