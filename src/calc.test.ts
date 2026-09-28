import { readFileSync } from "node:fs";

import { e_tilt, MakeTime } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { CALC_AYANAMSAS, CALC_BODIES, CALC_FRAMES, CALC_SPAN, calc, chart, events, houses } from "./calc.js";
import type { CalcBody, CalcFrame, CalcPosition, CalcRefusal, CalcRequest } from "./calc.js";
import { NODE_SPEED_STEP_DAYS, SPEED_STEP_DAYS } from "./ephemeris.js";
import { HOUSE_SYSTEMS } from "./houses.js";
import { chartPoints, natalChart, positions, searchLongitudeCrossings } from "./index.js";
import type { BodyName } from "./types.js";

const ARCSEC = Math.PI / 648_000;
const DEG = Math.PI / 180;
const INSTANTS = [
  "1800-01-01T00:00:00Z",
  "1851-03-14T04:37:00Z",
  "1969-07-20T20:17:00Z",
  "2000-01-01T12:00:00Z",
  "2024-04-08T18:21:30.250Z",
  // The last minutes of 2199 whose TT is still before 2200 (ΔT is 126 s there).
  "2199-12-31T23:57:00Z"
];

function ok(result: CalcPosition | CalcRefusal | { status: string }): CalcPosition {
  if (result.status !== "ok") throw new Error(`refused: ${JSON.stringify(result)}`);
  return result as CalcPosition;
}

function refused(result: { status: string }): CalcRefusal {
  if (result.status !== "refused") throw new Error("expected a refusal");
  return result as CalcRefusal;
}

type Xyz = readonly [number, number, number];
const xyzOf = (p: CalcPosition): Xyz => [p.cartesian!.x, p.cartesian!.y, p.cartesian!.z];
/** Angle between two vectors, arcseconds. */
function angle(a: Xyz, b: Xyz): number {
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(...cross), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ARCSEC;
}
const unitOf = (lon: number, lat: number): Xyz => [
  Math.cos(lat * DEG) * Math.cos(lon * DEG),
  Math.cos(lat * DEG) * Math.sin(lon * DEG),
  Math.sin(lat * DEG)
];
const direction = (p: CalcPosition): Xyz => unitOf(p.lon, p.lat);

describe("calc with every default is the engine's own position", () => {
  it.each(INSTANTS)("equals positions() to the bit at %s", (iso) => {
    for (const row of positions(iso)) {
      for (const time of [iso, new Date(iso), { iso }]) {
        const result = ok(calc({ body: row.body, time }));
        expect(result.lon).toBe(row.lon);
        expect(result.lat).toBe(row.lat);
        expect(result.speeds!.lon).toBe(row.speed);
      }
    }
  });

  it.each(INSTANTS)("equals chartPoints() for the mean node and Lilith at %s", (iso) => {
    for (const point of chartPoints({ utc: iso }).points) {
      if (!CALC_BODIES.includes(point.point as CalcBody)) continue;
      const result = ok(calc({ body: point.point as CalcBody, time: iso }));
      expect(result.lon).toBe(point.lon);
      expect(result.lat).toBe(point.lat);
      expect(result.speeds!.lon).toBe(point.speed);
    }
  });

  it("uses the engine's steps", () => {
    expect(ok(calc({ body: "Mars", time: INSTANTS[3]! })).bounds.speed!.stepDays).toBe(SPEED_STEP_DAYS);
    expect(ok(calc({ body: "North Node", time: INSTANTS[3]! })).bounds.speed!.stepDays).toBe(NODE_SPEED_STEP_DAYS);
  });

  it("with ΔT pinned at zero reads the instant as TT, like the conformance adapter", () => {
    const utc = "1969-07-20T20:17:00Z";
    const natal = natalChart({ utc, timeKnown: false, deltaT: 0 });
    for (const row of natal.bodies) {
      const result = ok(calc({ body: row.body, time: { iso: utc, deltaT: 0 } }));
      expect(result.lon).toBe(row.lon);
      expect(result.receipt.instants[0]!.jdTt).toBe(result.receipt.instants[0]!.jdUt);
    }
  });
});

describe("time vocabulary", () => {
  const iso = "2024-04-08T18:21:30Z";
  const jdUt = 2440587.5 + Date.parse(iso) / 86_400_000;

  // A Julian date near 2.46e6 holds time to about 4e-10 of a day, 40 µs, in which the Moon moves 2e-5″.
  it("reads a UT Julian date as the same instant as an ISO string", () => {
    for (const body of ["Sun", "Moon", "Mercury", "Pluto", "North Node", "Black Moon Lilith"] as const) {
      const a = ok(calc({ body, time: iso }));
      const b = ok(calc({ body, time: { jd: jdUt, scale: "UT" } }));
      expect(Math.abs(a.lon - b.lon) * 3600).toBeLessThan(1e-4);
      expect(Math.abs(a.speeds!.lon - b.speeds!.lon) * 3600).toBeLessThan(1e-3);
    }
  });

  it("reads a TT Julian date through ΔT, the model's or a pin", () => {
    const tt = 2460409.265;
    const modelled = ok(calc({ body: "Moon", time: { jd: tt, scale: "TT" } }));
    const [used] = modelled.receipt.instants;
    expect(Math.abs(used!.jdTt - tt) * 86_400).toBeLessThan(1e-6);
    // A Julian date near 2.46e6 holds time to about 4e-10 of a day.
    expect(Math.abs(used!.jdTt - used!.jdUt - used!.deltaT.seconds / 86_400)).toBeLessThan(1e-9);
    const again = ok(calc({ body: "Moon", time: { jd: used!.jdUt, scale: "UT" } }));
    expect(Math.abs(again.lon - modelled.lon) * 3600).toBeLessThan(1e-4);

    const pinned = ok(calc({ body: "Moon", time: { jd: tt, scale: "TT", deltaT: 50 } }));
    const same = ok(calc({ body: "Moon", time: { jd: tt - 50 / 86_400, scale: "UT", deltaT: 50 } }));
    expect(Math.abs(pinned.lon - same.lon) * 3600).toBeLessThan(1e-4);
    expect(pinned.receipt.instants[0]!.deltaT).toEqual({
      seconds: 50,
      sigma: null,
      model: "pinned",
      table: null,
      tableDigest: null,
      segment: "pinned"
    });
    expect(pinned.receipt.conventions).toContain("deltat:pinned");
  });

  it("converts every TT Julian date, even where astronomy-engine's own conversion cycles", () => {
    // At TT = J2000.0 - 65536 days, on the engine's ΔT, AstroTime.FromTerrestrialTime alternates between two doubles forever.
    const jd = 2_451_545 - 65_536;
    const result = ok(calc({ body: "Sun", time: { jd, scale: "TT" } }));
    expect(Math.abs(result.receipt.instants[0]!.jdTt - jd) * 86_400).toBeLessThan(1e-6);
    expect(houses({ time: { jd, scale: "TT" }, place: { latitude: 0, longitude: 0 } }).status).toBe("ok");
  });

  it("leaves the engine's ΔT model installed after a pinned call, whatever its outcome", () => {
    const before = positions(iso);
    ok(calc({ body: "Mars", time: { iso, deltaT: 1000 } }));
    refused(calc({ body: "Mars", time: { iso: "1700-01-01", deltaT: 1000 } }));
    expect(() => calc({ body: "Mars", time: { iso, deltaT: 1000 }, flags: { units: "grads" as never } })).toThrow(RangeError);
    ok(houses({ time: { iso, deltaT: 1000 }, place: { latitude: 10, longitude: 10 } }));
    ok(chart({ time: { iso, deltaT: 1000 }, place: { latitude: 10, longitude: 10 } }) as never);
    expect(positions(iso)).toEqual(before);
  });
});

describe("receipts", () => {
  const requests: CalcRequest[] = [
    { body: "Mars", time: "2024-04-08T18:21:30+02:00" },
    { body: "Moon", time: { jd: 2451545.25, scale: "TT", deltaT: 64 }, frame: "equatorial-icrs", flags: { cartesian: true } },
    { body: "Earth", time: new Date("1901-02-03T04:05:06Z"), center: "barycentric", frame: "ecliptic-j2000", flags: { correction: "astrometric", units: "radians" } },
    { body: "Venus", time: { iso: "2150-06-30" }, center: { topocentric: { latitude: -33.9, longitude: 18.4, height: 25 } }, frame: "equatorial-true-of-date", flags: { speeds: false } },
    { body: "Black Moon Lilith", time: "1850-01-01", frame: "ecliptic-mean-of-date", flags: { correction: "geometric" } },
    { body: "Saturn", time: { jd: 2400000.5, scale: "UT" }, center: "heliocentric", frame: "equatorial-mean-of-date", flags: { correction: "geometric", cartesian: true } }
  ];

  it.each(requests.map((request) => [JSON.stringify(request), request] as const))("replay %s", (_, request) => {
    const first = ok(calc(request));
    const replayed = ok(calc(JSON.parse(JSON.stringify(first.receipt.request)) as CalcRequest));
    expect(replayed).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("name precession and the obliquity for the nodes and Lilith in every frame, which they reach from the ecliptic of date", () => {
    for (const body of ["North Node", "Mean South Node", "Black Moon Lilith"] as const) {
      for (const frame of CALC_FRAMES) {
        const { conventions } = ok(calc({ body, time: "2000-01-01T00:00:00Z", frame })).receipt;
        expect(conventions).toEqual(expect.arrayContaining(["precession:iau2006", "obliquity:iau2006"]));
        // Outside the true-of-date frames the nutation in their definition and in the turn cancel.
        expect(conventions.includes("nutation:iau2000b-five-terms")).toBe(frame.includes("true"));
      }
    }
    const mars = ok(calc({ body: "Mars", time: "2000-01-01T00:00:00Z", frame: "equatorial-j2000" })).receipt.conventions;
    expect(mars).not.toContain("precession:iau2006");
    expect(mars).not.toContain("obliquity:iau2006");
  });

  it("name every convention by a namespaced id", () => {
    for (const request of requests) {
      const { conventions } = ok(calc(request)).receipt;
      for (const id of conventions) expect(id).toMatch(/^[a-z0-9-]+:[^\s]+$/);
      expect(conventions).toContain(`frame:${request.frame ?? "ecliptic-true-of-date"}`);
      expect(conventions.includes("nutation:iau2000b-five-terms")).toBe((request.frame ?? "ecliptic-true-of-date").includes("true"));
      expect(conventions.includes("frame-bias:iau2000")).toBe((request.frame ?? "").endsWith("icrs"));
    }
  });
});

describe("frames", () => {
  const time = "2031-08-17T05:00:00Z";
  const all = (body: CalcBody, extra: Partial<CalcRequest> = {}) =>
    Object.fromEntries(
      CALC_FRAMES.map((frame) => [frame, ok(calc({ body, time, frame, flags: { cartesian: body !== "North Node" }, ...extra }))])
    ) as Record<CalcFrame, CalcPosition>;

  it("keep the distance and turn only the direction", () => {
    const frames = all("Jupiter");
    for (const frame of CALC_FRAMES) {
      expect(frames[frame].dist).toBe(frames["ecliptic-true-of-date"].dist);
      const d = frames[frame].dist!;
      const [x, y, z] = xyzOf(frames[frame]);
      expect(angle([x, y, z], direction(frames[frame]))).toBeLessThan(1e-6);
      expect(Math.abs(Math.hypot(x, y, z) - d) / d).toBeLessThan(1e-14);
    }
  });

  it("differ between true and mean of date by the nutation in longitude along the ecliptic", () => {
    const frames = all("Mars");
    const dpsi = e_tilt(MakeTime(new Date(time))).dpsi;
    const lon = (frames["ecliptic-true-of-date"].lon - frames["ecliptic-mean-of-date"].lon) * 3600;
    expect(Math.abs(lon - dpsi)).toBeLessThan(1e-6);
    expect(Math.abs(frames["ecliptic-true-of-date"].lat - frames["ecliptic-mean-of-date"].lat) * 3600).toBeLessThan(1e-6);
  });

  it("put J2000.0 and the ICRS a frame bias apart, and J2000.0 and the mean equator of J2000.0 together", () => {
    const frames = all("Saturn");
    const bias = angle(xyzOf(frames["equatorial-j2000"]), xyzOf(frames["equatorial-icrs"]));
    expect(bias).toBeGreaterThan(0.005);
    expect(bias).toBeLessThan(0.0232);
    const epoch = { jd: 2451545, scale: "TT" as const };
    const mean = ok(calc({ body: "Saturn", time: epoch, frame: "equatorial-mean-of-date" }));
    const j2000 = ok(calc({ body: "Saturn", time: epoch, frame: "equatorial-j2000" }));
    expect(angle(direction(mean), direction(j2000))).toBeLessThan(1e-6);
  });

  it("tilt the ecliptic of J2000.0 by the IAU 2006 obliquity, 84381.406″", () => {
    const frames = all("Venus");
    const e = 84381.406 * ARCSEC;
    const [x, y, z] = xyzOf(frames["equatorial-j2000"]);
    const turned: Xyz = [x, Math.cos(e) * y + Math.sin(e) * z, -Math.sin(e) * y + Math.cos(e) * z];
    expect(angle(turned, xyzOf(frames["ecliptic-j2000"]))).toBeLessThan(1e-6);
    const [a, b, c] = xyzOf(frames["equatorial-icrs"]);
    const tilted: Xyz = [a, Math.cos(e) * b + Math.sin(e) * c, -Math.sin(e) * b + Math.cos(e) * c];
    expect(angle(tilted, xyzOf(frames["ecliptic-icrs"]))).toBeLessThan(1e-6);
  });

  it("carry the nodes, which have no distance, as directions", () => {
    const frames = all("North Node");
    expect(frames["ecliptic-true-of-date"].lat).toBe(0);
    expect(Math.abs(frames["ecliptic-mean-of-date"].lat) * 3600).toBeLessThan(1e-6);
    expect(Math.abs(frames["equatorial-true-of-date"].lat)).toBeGreaterThan(0.1);
    for (const frame of CALC_FRAMES) expect(frames[frame].dist).toBeNull();
  });

  it("give radians when asked", () => {
    const degrees = ok(calc({ body: "Uranus", time, frame: "equatorial-j2000" }));
    const radians = ok(calc({ body: "Uranus", time, frame: "equatorial-j2000", flags: { units: "radians" } }));
    expect(radians.lon).toBe(degrees.lon * DEG);
    expect(radians.lat).toBe(degrees.lat * DEG);
    expect(radians.speeds!.lon).toBe(degrees.speeds!.lon * DEG);
    expect(radians.dist).toBe(degrees.dist);
  });
});

describe("speeds", () => {
  const time = { jd: 2461000.5, scale: "TT" as const };

  it("are analytic for geometric positions on fixed axes, and agree with a central difference", () => {
    for (const body of ["Mercury", "Mars", "Pluto", "Sun", "Earth"] as const) {
      const center = body === "Earth" ? "heliocentric" : "geocentric";
      const request = { body, center, frame: "ecliptic-j2000", flags: { correction: "geometric", cartesian: true } } as const;
      const now = ok(calc({ ...request, time }));
      expect(now.bounds.speed!.method).toBe("analytic");
      // Long enough that the Julian date's own rounding (about 4e-10 of a day) does not show,
      // short enough that Mercury's curvature does not.
      const h = 0.003;
      const before = ok(calc({ ...request, time: { ...time, jd: time.jd - h } }));
      const after = ok(calc({ ...request, time: { ...time, jd: time.jd + h } }));
      const lon = ((after.lon - before.lon + 540) % 360) - 180;
      expect(Math.abs(lon / (2 * h) - now.speeds!.lon) * 3600).toBeLessThan(2e-3);
      expect(Math.abs((after.lat - before.lat) / (2 * h) - now.speeds!.lat) * 3600).toBeLessThan(2e-3);
      expect(Math.abs((after.dist! - before.dist!) / (2 * h) - now.speeds!.dist!)).toBeLessThan(1e-7);
      expect(Math.abs((after.cartesian!.x - before.cartesian!.x) / (2 * h) - now.cartesian!.vx!)).toBeLessThan(1e-7);
    }
  });

  it("in cartesian and spherical form describe the same motion", () => {
    for (const body of ["Moon", "Venus", "Neptune"] as const) {
      const now = ok(calc({ body, time, frame: "equatorial-true-of-date", flags: { cartesian: true } }));
      expect(now.bounds.speed!.method).toBe("central-difference");
      const { x, y, vx, vy } = now.cartesian as { x: number; y: number; vx: number; vy: number };
      const lonRate = ((x * vy - y * vx) / (x * x + y * y)) / DEG;
      expect(Math.abs(lonRate - now.speeds!.lon) * 3600).toBeLessThan(0.01);
    }
  });

  it("are left out when not asked for", () => {
    const quiet = ok(calc({ body: "Mars", time, flags: { speeds: false, cartesian: true } }));
    expect(quiet.speeds).toBeNull();
    expect(quiet.bounds.speed).toBeNull();
    expect(quiet.cartesian!.vx).toBeNull();
    expect(quiet.receipt.conventions.some((id) => id.startsWith("speed:"))).toBe(false);
  });
});

describe("centers and corrections", () => {
  const time = "2012-06-06T01:30:00Z";
  const cartesian = (body: CalcBody, center: NonNullable<CalcRequest["center"]>, correction: "apparent" | "astrometric" | "geometric", frame: CalcFrame = "equatorial-j2000") =>
    ok(calc({ body, time, center, frame, flags: { correction, cartesian: true } }));

  it("heliocentric Earth is the geometric geocentric Sun reversed", () => {
    const earth = xyzOf(cartesian("Earth", "heliocentric", "geometric"));
    const sun = xyzOf(cartesian("Sun", "geocentric", "geometric"));
    expect(earth).toEqual(sun.map((value) => -value));
  });

  it("barycentric positions differ from heliocentric ones by the Sun's barycentric position", () => {
    const sun = xyzOf(cartesian("Sun", "barycentric", "geometric"));
    const mars = xyzOf(cartesian("Mars", "barycentric", "geometric"));
    const helio = xyzOf(cartesian("Mars", "heliocentric", "geometric"));
    for (const i of [0, 1, 2]) expect(Math.abs(mars[i]! - sun[i]! - helio[i]!)).toBeLessThan(1e-14);
  });

  it("the barycentre does not move, so apparent and astrometric coincide there", () => {
    const apparent = cartesian("Jupiter", "barycentric", "apparent");
    const astrometric = cartesian("Jupiter", "barycentric", "astrometric");
    expect(apparent.lon).toBe(astrometric.lon);
    expect(apparent.dist).toBe(astrometric.dist);
  });

  it("apparent and astrometric positions differ by the annual aberration and share the light-path distance", () => {
    const apparent = cartesian("Sun", "geocentric", "apparent");
    const astrometric = cartesian("Sun", "geocentric", "astrometric");
    const shift = angle(direction(apparent), direction(astrometric));
    // v/c for the Earth's orbital speed, 29.29 to 30.29 km/s.
    expect(shift).toBeGreaterThan(20.1);
    expect(shift).toBeLessThan(20.9);
    expect(apparent.dist).toBe(astrometric.dist);
  });

  it("keeps the engine's geocentric Moon: apparent is the series at the instant", () => {
    for (const frame of CALC_FRAMES) {
      const apparent = cartesian("Moon", "geocentric", "apparent", frame);
      const geometric = cartesian("Moon", "geocentric", "geometric", frame);
      expect(angle(direction(apparent), direction(geometric))).toBeLessThan(1e-6);
    }
    const shift = angle(direction(cartesian("Moon", "geocentric", "apparent")), direction(cartesian("Moon", "geocentric", "astrometric")));
    expect(shift).toBeGreaterThan(19);
    expect(shift).toBeLessThan(22);
  });

  it("topocentric positions are geocentric ones seen from the observer", () => {
    const site = { topocentric: { latitude: 45, longitude: 10, height: 0 } };
    const geo = xyzOf(cartesian("Moon", "geocentric", "geometric"));
    const topo = xyzOf(cartesian("Moon", site, "geometric"));
    const offset = Math.hypot(geo[0] - topo[0], geo[1] - topo[1], geo[2] - topo[2]) * 149_597_870.7;
    expect(offset).toBeGreaterThan(6356);
    expect(offset).toBeLessThan(6379);
    const parallax = angle(direction(cartesian("Moon", site, "apparent")), direction(cartesian("Moon", "geocentric", "apparent")));
    expect(parallax / 3600).toBeGreaterThan(0.1);
    expect(parallax / 3600).toBeLessThan(1.05);
  });
});

describe("houses, events and chart wrap the engine's own functions", () => {
  const utc = "1987-11-05T06:12:00Z";

  it("houses() gives natalChart()'s angles and cusps and chartPoints()'s Vertex and East Point", () => {
    for (const houseSystem of HOUSE_SYSTEMS) {
      for (const latitude of [0, 51.5, -33.9, 70]) {
        const place = { latitude, longitude: -71.1 };
        const result = houses({ time: utc, place, system: houseSystem });
        if (result.status !== "ok") throw new Error("refused");
        const natal = natalChart({ utc, ...place, houseSystem });
        expect(result.angles).toEqual(natal.angles);
        expect(result.cusps).toEqual(natal.houses!.cusps);
        expect(result.system).toBe(natal.houses!.system);
        expect(result.flags.includes("polar-fallback")).toBe(natal.flags.includes("polar-fallback"));
        const points = chartPoints(natal).points;
        expect(result.vertex).toBe(points.find((p) => p.point === "Vertex")!.lon);
        expect(result.eastPoint).toBe(points.find((p) => p.point === "East Point")!.lon);
      }
    }
  });

  it("houses() carries the conformance suite's measured L2 bounds", () => {
    const summary = JSON.parse(readFileSync(new URL("../conformance/results/summary.json", import.meta.url), "utf8"));
    const kinds = summary.runs.find((run: { adapter: { name: string } }) => run.adapter.name === "zodiacs-engine").summary.byKind;
    const up = (value: number) => Math.ceil(value * 100) / 100;
    const angles = Math.max(
      kinds["angles.asc-mc"].residuals.asc.max,
      kinds["angles.asc-mc"].residuals.mc.max,
      kinds["angles.vertex-east-point"].residuals.vertex.max,
      kinds["angles.vertex-east-point"].residuals.east_point.max
    );
    const result = houses({ time: utc, place: { latitude: 10, longitude: 10 } });
    if (result.status !== "ok") throw new Error("refused");
    expect(result.bounds.angles.value).toBe(up(angles));
    expect(result.bounds.cusps.value).toBe(up(kinds["houses.cusps"].residuals.cusps.max));
  });

  it("events() gives searchLongitudeCrossings()'s crossings", () => {
    const cases: [BodyName, number, string, string, number][] = [
      ["Sun", 0, "2020-01-01", "2021-01-01", 5],
      ["Mars", 30, "2022-06-01", "2023-06-01", 2],
      ["Moon", 123.4, "2024-01-01", "2024-03-01", 0.25]
    ];
    for (const [body, longitude, from, to, stepDays] of cases) {
      const expected = searchLongitudeCrossings(body, longitude, new Date(from), new Date(to), { stepDays });
      const result = events({ kind: "longitude-crossing", body, longitude, from, to, stepDays });
      if (result.status !== "ok" || expected.status !== "complete") throw new Error("refused");
      expect(result.samples).toBe(expected.samples);
      expect(result.events.map((event) => [event.at, event.retrograde])).toEqual(
        expected.crossings.map((crossing) => [crossing.at.toISOString(), crossing.retrograde])
      );
    }
    const budget = refused(events({ kind: "longitude-crossing", body: "Sun", longitude: 0, from: "2020-01-01", to: "2021-01-01", maxSamples: 10 }));
    expect(budget).toMatchObject({ reason: "sample-budget", samples: 0, maxSamples: 10 });
  });

  it("chart() gives natalChart()'s chart", () => {
    const place = { latitude: 78.2232, longitude: 15.6267 };
    const cases = [
      [{ time: utc }, { utc }],
      [{ time: utc, place, houseSystem: "placidus" }, { utc, ...place, houseSystem: "placidus" }],
      [{ time: utc, place, houseSystem: "placidus", timeFlags: ["polar-fallback", "lmt"] }, { utc, ...place, houseSystem: "placidus", flags: ["polar-fallback", "lmt"] }],
      [{ time: utc, timeKnown: false, timeFlags: ["no-time"] }, { utc, timeKnown: false, flags: ["no-time"] }],
      [{ time: { iso: utc, deltaT: 12.5 }, place: { latitude: 1, longitude: 2 } }, { utc, latitude: 1, longitude: 2, deltaT: 12.5 }]
    ] as const;
    for (const [request, birth] of cases) {
      const result = chart(request as never);
      if (result.status !== "ok") throw new Error("refused");
      expect(result.chart).toEqual(natalChart(birth as never));
      const replay = chart(JSON.parse(JSON.stringify(result.receipt.request)));
      expect(replay).toEqual(result);
    }
    expect(() => chart({ time: utc, timeFlags: ["no-time"] })).toThrow(RangeError);
    expect(() => natalChart({ utc, flags: ["no-time"] })).toThrow(RangeError);
  });

  it("name the conventions calc() names for the same positions", () => {
    const ids = (body: CalcBody) => ok(calc({ body, time: utc })).receipt.conventions;
    const searched = events({ kind: "longitude-crossing", body: "Mars", longitude: 30, from: "2022-06-01", to: "2023-06-01" });
    if (searched.status !== "ok") throw new Error("refused");
    expect(new Set(searched.receipt.conventions)).toEqual(
      new Set([...ids("Mars").filter((id) => !id.startsWith("speed:")), "search:scan-and-bisect"])
    );
    const place = { latitude: 78.2232, longitude: 15.6267 };
    const full = chart({ time: utc, place, houseSystem: "placidus" });
    const timeless = chart({ time: utc });
    const pinned = chart({ time: { iso: utc, deltaT: 12.5 } });
    if (full.status !== "ok" || timeless.status !== "ok" || pinned.status !== "ok") throw new Error("refused");
    const wanted = [...ids("Mars"), ...ids("Moon"), ...ids("North Node")].filter((id) => id !== "correction:not-applicable");
    for (const id of wanted) expect(full.receipt.conventions).toContain(id);
    expect(full.receipt.conventions).toEqual(expect.arrayContaining(["house:placidus", "polar-fallback:whole", "sidereal-time:gast-iau2006-era"]));
    expect(timeless.receipt.conventions.filter((id) => /^(house|polar-fallback|angles|sidereal-time):/.test(id))).toEqual([]);
    expect(pinned.receipt.conventions).toContain("deltat:pinned");
  });
});

describe("typed refusals", () => {
  const time = "2000-01-01T00:00:00Z";

  it("refuse the sidereal zodiac, named by ayanamsa, in this version", () => {
    for (const ayanamsa of CALC_AYANAMSAS) {
      const zodiac = { sidereal: ayanamsa };
      for (const result of [
        calc({ body: "Moon", time, zodiac }),
        houses({ time, place: { latitude: 0, longitude: 0 }, zodiac }),
        events({ kind: "longitude-crossing", body: "Sun", longitude: 0, from: time, to: "2000-02-01", zodiac }),
        chart({ time, zodiac })
      ]) {
        expect(refused(result).reason).toBe("not-in-this-version");
      }
    }
  });

  it("refuse gravitational deflection in this version", () => {
    expect(refused(calc({ body: "Venus", time, flags: { deflection: true } })).reason).toBe("not-in-this-version");
  });

  it("refuse combinations with no meaning", () => {
    const cases: CalcRequest[] = [
      { body: "Sun", time, center: "heliocentric" },
      { body: "Earth", time },
      { body: "Earth", time, center: { topocentric: { latitude: 0, longitude: 0 } } },
      { body: "Mean Node", time, center: "heliocentric" },
      { body: "North Node", time, center: { topocentric: { latitude: 0, longitude: 0 } } },
      { body: "Black Moon Lilith", time, flags: { cartesian: true } }
    ];
    for (const request of cases) expect(refused(calc(request)).reason).toBe("unsupported-combination");
    const window = { kind: "longitude-crossing", longitude: 0, from: time, to: "2000-02-01" } as const;
    expect(refused(events({ ...window, body: "Earth" })).reason).toBe("unsupported-combination");
    expect(refused(events({ ...window, body: "Mean Node" })).reason).toBe("unsupported-combination");
    expect(refused(events({ ...window, body: "Sun", from: { iso: time, deltaT: 60 } })).reason).toBe("unsupported-combination");
  });

  it("refuse instants whose UT or TT is outside the span, and compute its first instant", () => {
    const first = 2_378_496.5; // 1800-01-01T00:00
    const last = 2_524_593.5; // 2200-01-01T00:00
    const outside = [
      "1799-12-31T23:59:59.999Z",
      CALC_SPAN.to,
      "2199-12-31T23:59:59Z", // TT 126 s later, in 2200
      { jd: 2378496.4, scale: "UT" },
      { jd: first, scale: "TT" }, // UT 18.7 s earlier, in 1799
      { jd: last, scale: "TT" },
      { jd: last + 2 / 1440, scale: "TT" }, // UT still in 2199
      { jd: first + 30 / 86_400, scale: "UT", deltaT: -60 }, // TT in 1799
      { jd: 1e300, scale: "TT" },
      { jd: -1e300, scale: "UT" },
      { jd: 2451545, scale: "TT", deltaT: 1e10 },
      { iso: "2199-06-01T00:00:00Z", deltaT: 1e10 }, // TT in 2516
      { iso: "1800-06-01T00:00:00Z", deltaT: -1e10 }
    ] as const;
    for (const t of outside) {
      const result = refused(calc({ body: "Moon", time: t }));
      expect(result).toMatchObject({ reason: "out-of-range", span: { from: CALC_SPAN.from, to: CALC_SPAN.to } });
    }
    for (const t of [CALC_SPAN.from, "2199-12-31T23:57:00Z", { jd: first + 30 / 86_400, scale: "TT" }, { jd: last - 1 / 86_400, scale: "TT" }] as const) {
      ok(calc({ body: "Moon", time: t }));
    }
    expect(refused(houses({ time: { iso: "2199-06-01T00:00:00Z", deltaT: 1e10 }, place: { latitude: 0, longitude: 0 } })).reason).toBe("out-of-range");
    expect(refused(chart({ time: { jd: last, scale: "TT" } })).reason).toBe("out-of-range");
    expect(refused(houses({ time: "1700-01-01", place: { latitude: 0, longitude: 0 } })).reason).toBe("out-of-range");
    expect(refused(chart({ time: "2300-01-01" })).reason).toBe("out-of-range");
    expect(refused(events({ kind: "longitude-crossing", body: "Sun", longitude: 0, from: "2199-06-01", to: "2200-06-01" })).reason).toBe("out-of-range");
  });

  it("are refusals, not exceptions, and computed bodies carry labelled bounds", () => {
    const result = ok(calc({ body: "Pluto", time }));
    for (const b of [result.bounds.position, result.bounds.distance!, result.bounds.speed!]) {
      expect(["measured", "estimated"]).toContain(b.label);
      if (b.value === null) expect(b.label).toBe("estimated");
    }
  });
});

describe("malformed input throws RangeError", () => {
  const time = "2000-01-01T00:00:00Z";
  it.each([
    ["an unknown body", { body: "Chiron", time }],
    ["an unknown frame", { body: "Sun", time, frame: "galactic" }],
    ["an unknown center", { body: "Sun", time, center: "selenocentric" }],
    ["an unknown field", { body: "Sun", time, epoch: "J2000" }],
    ["an unknown flag", { body: "Sun", time, flags: { nutation: false } }],
    ["a non-boolean flag", { body: "Sun", time, flags: { speeds: "yes" } }],
    ["an unknown correction", { body: "Sun", time, flags: { correction: "true" } }],
    ["a bare number", { body: "Sun", time: 2451545 }],
    ["an invalid ISO date", { body: "Sun", time: "2000-02-30" }],
    ["a local time without an offset", { body: "Sun", time: "2000-01-01T12:00" }],
    ["a Julian date without a scale", { body: "Sun", time: { jd: 2451545 } }],
    ["an unknown time scale", { body: "Sun", time: { jd: 2451545, scale: "UTC" } }],
    ["a non-finite Julian date", { body: "Sun", time: { jd: Number.NaN, scale: "TT" } }],
    ["both iso and jd", { body: "Sun", time: { iso: time, jd: 2451545, scale: "TT" } }],
    ["a non-finite ΔT", { body: "Sun", time: { iso: time, deltaT: Number.POSITIVE_INFINITY } }],
    ["a latitude out of range", { body: "Moon", time, center: { topocentric: { latitude: 91, longitude: 0 } } }],
    ["a height out of range", { body: "Moon", time, center: { topocentric: { latitude: 0, longitude: 0, height: 1e6 } } }],
    ["an unknown ayanamsa", { body: "Sun", time, zodiac: { sidereal: "lahiri-1940" } }]
  ])("for %s", (_, request) => {
    expect(() => calc(request as never)).toThrow(RangeError);
  });

  it("in houses, events and chart too", () => {
    expect(() => houses({ time, place: { latitude: 0, longitude: 0 }, system: "koch-2" as never })).toThrow(RangeError);
    expect(() => houses({ time, place: { latitude: 0 } as never })).toThrow(RangeError);
    const window = { kind: "longitude-crossing", body: "Sun", longitude: 0, from: time, to: "2000-02-01" } as const;
    expect(() => events({ ...window, kind: "station" as never })).toThrow(RangeError);
    expect(() => events({ ...window, longitude: Number.NaN })).toThrow(RangeError);
    expect(() => events({ ...window, stepDays: 0 })).toThrow(RangeError);
    expect(() => events({ ...window, maxSamples: 1.5 })).toThrow(RangeError);
    expect(() => events({ ...window, from: "2000-03-01" })).toThrow(RangeError);
    expect(() => chart({ time, houseSystem: "placidus-2" as never })).toThrow(RangeError);
    expect(() => chart({ time, timeFlags: ["dst-gap", "dst-fold"] })).toThrow(RangeError);
  });
});
