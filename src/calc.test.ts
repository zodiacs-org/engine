import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CALC_AYANAMSAS, CALC_BODIES, CALC_FRAMES, CALC_SPAN, calc, chart, events, houses } from "./calc.js";
import type { CalcBody, CalcCenter, CalcFrame, CalcPosition, CalcRefusal, CalcRequest, CalcTime, HousesResult } from "./calc.js";
import { NODE_SPEED_STEP_DAYS, SPEED_STEP_DAYS } from "./ephemeris.js";
import { HOUSE_SYSTEMS } from "./houses.js";
import { chartPoints, natalChart, positions, searchLongitudeCrossings } from "./index.js";
import { tilt } from "./nutation.js";
import { timeBands } from "./time-bands.js";
import { timeBasis } from "./time-scale.js";
import type { BodyName } from "./types.js";

const ARCSEC = Math.PI / 648_000;
const DEG = Math.PI / 180;
const INSTANTS = [
  "1800-01-01T00:00:00Z",
  "1851-03-14T04:37:00Z",
  "1969-07-20T20:17:00Z",
  "2000-01-01T12:00:00Z",
  // Within 86.4 s of the time basis's steps, where a speed's two samples straddle
  // one: the start of the leap-second era and the leap second of 2016-12-31.
  "1972-01-01T00:00:30Z",
  "2016-12-31T23:59:30Z",
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

  it("with ΔT pinned, and on a TT Julian date, is natalChart()'s chart on the same pin and scale", () => {
    // Before 1972 civil time is read as UT1, so a pin of zero makes the instant TT.
    const utc = "1969-07-20T20:17:00Z";
    const natal = natalChart({ utc, timeKnown: false, deltaT: 0 });
    for (const row of natal.bodies) {
      const result = ok(calc({ body: row.body, time: { iso: utc, deltaT: 0 } }));
      expect(result.lon).toBe(row.lon);
      expect(result.receipt.instants[0]!.jdTt).toBe(result.receipt.instants[0]!.jdUt1);
    }
    // At any date a TT Julian date is TT, as the conformance adapter asks for it.
    const tt = "1990-06-15T12:30:00Z";
    const onTt = natalChart({ utc: tt, timeScale: "tt", timeKnown: false });
    for (const row of onTt.bodies) {
      const result = ok(calc({ body: row.body, time: { jd: 2_440_587.5 + Date.parse(tt) / 86_400_000, scale: "tt" } }));
      expect(Math.abs(result.lon - row.lon) * 3600).toBeLessThan(1e-4);
    }
  });
});

describe("time vocabulary", () => {
  const iso = "2024-04-08T18:21:30Z";
  const jdUt = 2440587.5 + Date.parse(iso) / 86_400_000;

  // A Julian date near 2.46e6 holds time to about 4e-10 of a day, 40 µs, in which the Moon moves 2e-5″.
  it("reads a UTC Julian date as the same instant as an ISO string", () => {
    for (const body of ["Sun", "Moon", "Mercury", "Pluto", "North Node", "Black Moon Lilith"] as const) {
      const a = ok(calc({ body, time: iso }));
      const b = ok(calc({ body, time: { jd: jdUt, scale: "utc" } }));
      expect(Math.abs(a.lon - b.lon) * 3600).toBeLessThan(1e-4);
      expect(Math.abs(a.speeds!.lon - b.speeds!.lon) * 3600).toBeLessThan(1e-3);
    }
  });

  it("reads a UT1 Julian date as UT1, UT1 − UTC away from the same UTC date", () => {
    const utc = ok(calc({ body: "Moon", time: { jd: jdUt, scale: "utc" } }));
    const [used] = utc.receipt.instants;
    const offset = used!.timeScale.ut1MinusUtc!.seconds;
    expect(Math.abs(offset)).toBeGreaterThan(0);
    expect(Math.abs(used!.jdUt1 - jdUt - offset / 86_400) * 86_400).toBeLessThan(1e-5);
    const ut1 = ok(calc({ body: "Moon", time: { jd: used!.jdUt1, scale: "ut1" } }));
    expect(Math.abs(ut1.lon - utc.lon) * 3600).toBeLessThan(1e-4);
    expect(Math.abs(ut1.receipt.instants[0]!.jdTt - used!.jdTt) * 86_400).toBeLessThan(1e-5);
  });

  it("reads a TT Julian date through ΔT, the model's or a pin", () => {
    const tt = 2460409.265;
    const modelled = ok(calc({ body: "Moon", time: { jd: tt, scale: "tt" } }));
    const [used] = modelled.receipt.instants;
    expect(Math.abs(used!.jdTt - tt) * 86_400).toBeLessThan(1e-6);
    // A Julian date near 2.46e6 holds time to about 4e-10 of a day.
    expect(Math.abs(used!.jdTt - used!.jdUt1 - used!.deltaT.seconds / 86_400)).toBeLessThan(1e-9);
    const again = ok(calc({ body: "Moon", time: { jd: used!.jdUt1, scale: "ut1" } }));
    expect(Math.abs(again.lon - modelled.lon) * 3600).toBeLessThan(1e-4);

    const pinned = ok(calc({ body: "Moon", time: { jd: tt, scale: "tt", deltaT: 50 } }));
    const same = ok(calc({ body: "Moon", time: { jd: tt - 50 / 86_400, scale: "ut1", deltaT: 50 } }));
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
    const result = ok(calc({ body: "Sun", time: { jd, scale: "tt" } }));
    expect(Math.abs(result.receipt.instants[0]!.jdTt - jd) * 86_400).toBeLessThan(1e-6);
    expect(houses({ time: { jd, scale: "tt" }, place: { latitude: 0, longitude: 0 } }).status).toBe("ok");
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
    { body: "Moon", time: { jd: 2451545.25, scale: "tt", deltaT: 64 }, frame: "equatorial-icrs", flags: { cartesian: true } },
    { body: "Earth", time: new Date("1901-02-03T04:05:06Z"), center: "barycentric", frame: "ecliptic-j2000", flags: { correction: "astrometric", units: "radians" } },
    { body: "Venus", time: { iso: "2150-06-30" }, center: { topocentric: { latitude: -33.9, longitude: 18.4, height: 25 } }, frame: "equatorial-true-of-date", flags: { speeds: false } },
    { body: "Black Moon Lilith", time: "1850-01-01", frame: "ecliptic-mean-of-date", flags: { correction: "geometric" } },
    { body: "Saturn", time: { jd: 2400000.5, scale: "utc" }, center: "heliocentric", frame: "equatorial-mean-of-date", flags: { correction: "geometric", cartesian: true } }
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
        expect(conventions.includes("nutation:iau2000b")).toBe(frame.includes("true"));
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
      expect(conventions.includes("nutation:iau2000b")).toBe((request.frame ?? "ecliptic-true-of-date").includes("true"));
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
    // The engine's Δψ (src/nutation.ts) at the instant's TT.
    const dpsi = tilt(timeBasis(Date.parse(time), "utc").ttDays).dpsi;
    const lon = (frames["ecliptic-true-of-date"].lon - frames["ecliptic-mean-of-date"].lon) * 3600;
    expect(Math.abs(lon - dpsi)).toBeLessThan(1e-6);
    expect(Math.abs(frames["ecliptic-true-of-date"].lat - frames["ecliptic-mean-of-date"].lat) * 3600).toBeLessThan(1e-6);
  });

  it("put J2000.0 and the ICRS a frame bias apart, and J2000.0 and the mean equator of J2000.0 together", () => {
    const frames = all("Saturn");
    const bias = angle(xyzOf(frames["equatorial-j2000"]), xyzOf(frames["equatorial-icrs"]));
    expect(bias).toBeGreaterThan(0.005);
    expect(bias).toBeLessThan(0.0232);
    const epoch = { jd: 2451545, scale: "tt" as const };
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
  const time = { jd: 2461000.5, scale: "tt" as const };

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

  it("put the observer at the local apparent sidereal time, on the true equator of date", () => {
    // The geocentric Moon less the topocentric one is the observer's
    // geocentric position. On the true equator and equinox of date its right
    // ascension is the RAMC of houses() and its declination the observer's
    // geocentric latitude on the IERS 2003 ellipsoid.
    for (const [latitude, longitude] of [[45, 10], [-33.9, 18.4], [69.6, -140.2]] as const) {
      const site = { topocentric: { latitude, longitude, height: 0 } };
      const frame = "equatorial-true-of-date";
      const geo = xyzOf(cartesian("Moon", "geocentric", "geometric", frame));
      const topo = xyzOf(cartesian("Moon", site, "geometric", frame));
      const [x, y, z] = [0, 1, 2].map((i) => geo[i]! - topo[i]!);
      const placed = houses({ time, place: { latitude, longitude } });
      if (placed.status !== "ok") throw new Error("refused");
      const ra = (Math.atan2(y!, x!) / DEG + 360) % 360;
      expect(Math.abs(((ra - placed.armc + 540) % 360) - 180) * 3600).toBeLessThan(1e-6);
      const geocentric = Math.atan(0.996647180302104 ** 2 * Math.tan(latitude * DEG)) / DEG;
      expect(Math.abs(Math.atan2(z!, Math.hypot(x!, y!)) / DEG - geocentric) * 3600).toBeLessThan(1e-6);
    }
  });
});

describe("houses, events and chart wrap the engine's own functions", () => {
  const utc = "1987-11-05T06:12:00Z";

  it("houses() gives natalChart()'s angles and cusps and chartPoints()'s Vertex and East Point", () => {
    for (const houseSystem of HOUSE_SYSTEMS) {
      for (const latitude of [0, 51.5, -33.9, 70]) {
        const place = { latitude, longitude: -71.1 };
        const result = houses({ time: utc, place, houseSystem });
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

// The bands from the time basis (docs/calc.md, "Bands"), as the named tests of
// docs/evidence/1.1.0-rc.2-20261102/time-bands/PREREGISTRATION.md, section 6,
// list them. Their controls are run outside the suite.
describe("bands from the time basis", () => {
  const BAND_ID = "time-band:first-order";
  /** A band that the rule makes zero is exactly +0. */
  const zero = (value: number) => Object.is(value, 0);
  const housesOk = (result: HousesResult | CalcRefusal): HousesResult => {
    if (result.status !== "ok") throw new Error(`refused: ${JSON.stringify(result)}`);
    return result;
  };
  /** The difference of two longitudes, degrees, wrapped into (−180°, 180°]. */
  const turn = (a: number, b: number) => {
    let d = a - b;
    if (d > 180) d -= 360;
    else if (d <= -180) d += 360;
    return d;
  };

  it("are null without speeds and present otherwise", () => {
    const time = { jd: 2_469_807.5, scale: "ut1" } as const;
    expect(ok(calc({ body: "Mars", time, flags: { speeds: false } })).band).toBeNull();
    const centers: [CalcBody, CalcCenter][] = [
      ...CALC_BODIES.filter((body) => body !== "Earth").map((body) => [body, "geocentric"] as [CalcBody, CalcCenter]),
      ["Earth", "heliocentric"], ["Mars", "barycentric"], ["Moon", { topocentric: { latitude: 45, longitude: 10 } }]
    ];
    for (const [body, center] of centers) {
      const result = ok(calc({ body, time, center }));
      const band = result.band!;
      expect(band, body).not.toBeNull();
      expect(band.time, body).toEqual(timeBands(result.receipt.instants[0]!));
      expect(band.lon, body).toBeGreaterThan(0);
      expect(band.lat, body).toBeGreaterThanOrEqual(0);
      expect(band.dist === null, body).toBe(result.dist === null);
    }
  });

  it("are in arcseconds under units: radians", () => {
    // A UT1 instant, whose TT band is the ΔT band.
    for (const body of ["Mars", "Moon", "Mean Node"] as const) {
      const time = { jd: 2_469_807.5, scale: "ut1" } as const;
      const degrees = ok(calc({ body, time }));
      const radians = ok(calc({ body, time, flags: { units: "radians" } }));
      const band = degrees.band!;
      expect(band.time.tt, body).toBeGreaterThan(0);
      expect(radians.band, body).toEqual(band);
      expect(band.lon, body).toBe((Math.abs(degrees.speeds!.lon) / 24) * band.time.tt);
      expect(band.lat, body).toBe((Math.abs(degrees.speeds!.lat) / 24) * band.time.tt);
    }
  });

  it("give whole-sign cusps 0, and the cusps where Placidus or Koch falls back to whole signs", () => {
    // UTC on the IERS basis: UT1 carries the band, so every angle has one.
    const time = "2000-01-01T12:00:00Z";
    const cases: [string, HousesResult][] = [
      ["whole", housesOk(houses({ time, place: { latitude: 51.5, longitude: -0.1 } }))],
      ["whole, sidereal", housesOk(houses({ time, place: { latitude: 51.5, longitude: -0.1 }, zodiac: { sidereal: "lahiri" } }))],
      ["placidus at 70°", housesOk(houses({ time, place: { latitude: 70, longitude: 20 }, houseSystem: "placidus" }))],
      ["koch at -70°", housesOk(houses({ time, place: { latitude: -70, longitude: 20 }, houseSystem: "koch" }))]
    ];
    for (const [label, result] of cases) {
      expect(result.system, label).toBe("whole");
      expect(result.band.cusps, label).toHaveLength(12);
      expect(result.band.cusps.every(zero), label).toBe(true);
      expect(result.band.asc, label).toBeGreaterThan(0);
    }
    const placidus = housesOk(houses({ time, place: { latitude: 51.5, longitude: -0.1 }, houseSystem: "placidus" }));
    expect(placidus.band.cusps.every((cusp) => cusp > 0)).toBe(true);
    expect(placidus.band.cusps[0]).toBe(placidus.band.asc);
  });

  /** An angle's or a cusp's band, by name, and its value: the four angles, then the cusps unless they are sign starts. */
  const angleRows = (result: HousesResult) => [
    ["asc", result.band.asc, result.angles.asc],
    ["mc", result.band.mc, result.angles.mc],
    ["vertex", result.band.vertex, result.vertex],
    ["eastPoint", result.band.eastPoint, result.eastPoint],
    ...(result.system === "whole" ? [] : result.cusps.map((cusp, k) => [`cusps.${k}`, result.band.cusps[k]!, cusp]))
  ] as [string, number, number][];

  it("add each angle's and cusp's rate on TT, UT1 held, times the TT band", () => {
    // UT1 input: TT carries the ΔT band and UT1 none, so the band is the rate on TT times it. The same rate,
    // by another road: half the difference with ΔT pinned at d0 ± 600 s on the same UT1, over 600 s.
    const jd = 2_469_807.5;
    const place = { latitude: 51.5, longitude: -0.1 };
    let compared = 0;
    for (const houseSystem of ["whole", "placidus", "regiomontanus", "morinus"] as const) {
      for (const zodiac of [undefined, { sidereal: "lahiri" } as const]) {
        const request = { place, houseSystem, ...(zodiac ? { zodiac } : {}) };
        const result = housesOk(houses({ ...request, time: { jd, scale: "ut1" } }));
        const { tt, ut1 } = result.band.time;
        expect([tt > 0, zero(ut1)]).toEqual([true, true]);
        const d0 = result.receipt.instants[0]!.deltaT.seconds;
        const [plus, minus] = [d0 + 600, d0 - 600].map((pin) => angleRows(housesOk(houses({ ...request, time: { jd, scale: "ut1", deltaT: pin } }))));
        angleRows(result).forEach(([name, band], index) => {
          const expected = ((Math.abs(turn(plus![index]![2], minus![index]![2])) * 3600) / 1200) * tt;
          expect(band, `${houseSystem} ${zodiac ? "lahiri" : "tropical"} ${name}`).toBeGreaterThan(0);
          // The two roads round TT apart by a unit in its last place, and each angle by a few in its own.
          expect(Math.abs(band - expected), `${houseSystem} ${zodiac ? "lahiri" : "tropical"} ${name}`).toBeLessThanOrEqual(1e-6 * expected + 1e-10);
          compared += 1;
        });
      }
    }
    expect(compared).toBe(2 * (4 + 16 * 3));
  });

  it("take a cusp's rate on TT from the side that keeps Placidus or Koch, where TT moved the other way makes it fall back", () => {
    // Review 2 of 1.1.0-rc.2: 1e-9° inside the polar limit 90° − ε, ε the instant's true obliquity, TT moved by
    // 600 s one way moves ε past the latitude, and Placidus and Koch fall back to whole signs there though not at
    // the instant; the central difference across that side gave cusp bands of thousands of arcseconds. On UTC
    // input after the IERS table, so the TT band is tens of seconds. The rates by another road, from pins: ΔT at
    // d0 and d0 ± 600 s on the instant's UT1 (TT moves, UT1 holds), and at d0 ± 1 s on its TT (UT1 moves, TT holds).
    const longitude = 33.3;
    let compared = 0;
    // On the first instant TT 600 s earlier makes the systems fall back, on the second TT 600 s later.
    for (const [time, fallsBack] of [["2121-08-30T03:33:00Z", [false, true]], ["2121-09-06T03:33:00Z", [true, false]]] as const) {
      const epsilon = housesOk(houses({ time, place: { latitude: 10, longitude }, houseSystem: "placidus" })).obliquity;
      const place = { latitude: 90 - epsilon - 1e-9, longitude };
      for (const houseSystem of ["placidus", "koch"] as const) {
        const label = `${time} ${houseSystem}`;
        const result = housesOk(houses({ time, place, houseSystem }));
        expect(result.system, label).toBe(houseSystem);
        const { tt, ut1 } = result.band.time;
        expect([tt > 10, ut1], label).toEqual([true, 0.9]);
        const instant = result.receipt.instants[0]!;
        const d0 = instant.deltaT.seconds;
        const onUt1 = (pin: number) => housesOk(houses({ time: { jd: instant.jdUt1, scale: "ut1", deltaT: pin }, place, houseSystem }));
        const onTt = (pin: number) => housesOk(houses({ time: { jd: instant.jdTt, scale: "tt", deltaT: pin }, place, houseSystem }));
        const [later, earlier, here] = [onUt1(d0 + 600), onUt1(d0 - 600), onUt1(d0)];
        expect([later.system === "whole", earlier.system === "whole", here.system], label).toEqual([...fallsBack, houseSystem]);
        const kept = fallsBack[0] ? earlier : later;
        // UT1 = TT − ΔT: the larger pin gives the earlier UT1.
        const [before, after] = [onTt(d0 + 1), onTt(d0 - 1)];
        result.band.cusps.forEach((band, k) => {
          const onTtRate = (Math.abs(turn(kept.cusps[k]!, here.cusps[k]!)) * 3600) / 600;
          const onUt1Rate = (Math.abs(turn(after.cusps[k]!, before.cusps[k]!)) * 3600) / 2;
          const expected = onUt1Rate * ut1 + onTtRate * tt;
          expect(Math.abs(band - expected), `${label} cusps.${k}`).toBeLessThanOrEqual(1e-6 * expected + 1e-10);
          compared += 1;
        });
      }
    }
    expect(compared).toBe(2 * 2 * 12);
  });

  it("give sidereal angles and cusps the tropical ones' rate on UT1, and on TT the sidereal longitude's", () => {
    const place = { latitude: 51.5, longitude: -0.1 };
    // On UTC input on the IERS basis TT has no band, so the two zodiacs' bands are the same.
    for (const houseSystem of HOUSE_SYSTEMS) {
      const time = "2020-06-01T12:00:00Z";
      const tropical = housesOk(houses({ time, place, houseSystem }));
      expect(zero(tropical.band.time.tt), houseSystem).toBe(true);
      for (const sidereal of ["lahiri", "fagan-bradley"] as const) {
        expect(housesOk(houses({ time, place, houseSystem, zodiac: { sidereal } })).band, `${houseSystem} ${sidereal}`).toEqual(tropical.band);
      }
    }
    // After the table both carry a band, and the ayanamsa's rate on TT moves every sidereal angle and cusp.
    for (const houseSystem of ["whole", "placidus", "koch"] as const) {
      const time = "2050-06-01T12:00:00Z";
      const tropical = housesOk(houses({ time, place, houseSystem }));
      const sidereal = housesOk(houses({ time, place, houseSystem, zodiac: { sidereal: "lahiri" } }));
      expect(sidereal.band.time).toEqual(tropical.band.time);
      expect(tropical.band.time.tt, houseSystem).toBeGreaterThan(0);
      angleRows(sidereal).forEach(([name, band], index) => {
        expect(band, `${houseSystem} ${name}`).not.toBe(angleRows(tropical)[index]![1]);
      });
    }
  });

  it("bound a topocentric position at or above its partials on TT and UT1 from pinned evaluations", () => {
    const sites = [{ latitude: 45, longitude: 10, height: 0 }, { latitude: 10, longitude: 30, height: 100_000 }];
    let compared = 0;
    for (const jdUt1 of [2_451_545.25, 2_469_807.5]) {
      for (const site of sites) {
        for (const body of ["Sun", "Moon", "Mars"] as const) {
          const center = { topocentric: site };
          const at = (time: CalcTime) => ok(calc({ body, time, center }));
          const anchor = at({ jd: jdUt1, scale: "ut1" }).receipt.instants[0]!;
          const d0 = anchor.deltaT.seconds;
          // Per second: TT moved by ±10 s with UT1 fixed (UT1 input), and UT1 moved with TT fixed (TT input).
          const partial = (scale: "ut1" | "tt", jd: number) => {
            const [a, b] = [at({ jd, scale, deltaT: d0 + 10 }), at({ jd, scale, deltaT: d0 - 10 })];
            return { lon: (Math.abs(turn(a.lon, b.lon)) * 3600) / 20, lat: (Math.abs(a.lat - b.lat) * 3600) / 20, dist: Math.abs(a.dist! - b.dist!) / 20 };
          };
          const onTt = partial("ut1", jdUt1);
          const onUt1 = partial("tt", anchor.jdTt);
          const forms: CalcTime[] = [
            { jd: anchor.jdTt, scale: "tt" },
            { jd: jdUt1, scale: "ut1" },
            { iso: anchor.utc },
            { jd: jdUt1, scale: "ut1", deltaT: d0 },
            { iso: anchor.utc, deltaT: d0 }
          ];
          for (const time of forms) {
            const band = at(time).band!;
            const label = `${body} ${jdUt1} ${site.height} ${JSON.stringify(time)}`;
            expect(band.lon, label).toBeGreaterThanOrEqual(onTt.lon * band.time.tt + onUt1.lon * band.time.ut1 - 1e-9);
            expect(band.lat, label).toBeGreaterThanOrEqual(onTt.lat * band.time.tt + onUt1.lat * band.time.ut1 - 1e-9);
            expect(band.dist!, label).toBeGreaterThanOrEqual(onTt.dist * band.time.tt + onUt1.dist * band.time.ut1 - 1e-15);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(60);
  });

  it("carry the events' and the charts' bands", () => {
    // An event is fixed in TT: its UTC's band is TT − UTC's at the event, its UT1's the ΔT band there.
    for (const year of [1900, 2020, 2050]) {
      const found = events({ kind: "longitude-crossing", body: "Sun", longitude: 0, from: `${year}-03-01`, to: `${year}-04-01` });
      if (found.status !== "ok") throw new Error("refused");
      expect(found.events).toHaveLength(1);
      for (const event of found.events) {
        const basis = timeBasis(Date.parse(event.at), "utc");
        const d = basis.deltaT.sigma!;
        expect(d, event.at).toBeGreaterThan(0);
        expect(event.band.ut1, event.at).toBe(d);
        if (year === 2020) expect(zero(event.band.utc), event.at).toBe(true);
        else expect(event.band.utc, event.at).toBe(year === 1900 ? d : Math.hypot(0.9, d));
      }
    }
    // UTC on the IERS basis: TT is exact, so the bodies have no band, and the angles have UT1's.
    const time = "1987-11-05T06:12:00Z";
    const place = { latitude: 51.5, longitude: -0.1 };
    const timed = chart({ time, place });
    const timeless = chart({ time });
    const onUt1 = chart({ time: { jd: 2_447_104.75, scale: "ut1" }, place });
    if (timed.status !== "ok" || timeless.status !== "ok" || onUt1.status !== "ok") throw new Error("refused");
    expect(timed.band.time).toEqual({ tt: 0, ut1: timed.chart.timeScale.ut1MinusUtc!.sigma });
    expect(timed.band.bodies.map((row) => row.body)).toEqual(timed.chart.bodies.map((row) => row.body));
    expect(timed.band.bodies.every((row) => zero(row.lon))).toBe(true);
    const angles = housesOk(houses({ time, place })).band;
    expect([timed.band.asc, timed.band.mc]).toEqual([angles.asc, angles.mc]);
    expect(timed.band.asc).toBeGreaterThan(0);
    expect([timeless.band.asc, timeless.band.mc]).toEqual([null, null]);
    expect(timeless.band.bodies.every((row) => zero(row.lon))).toBe(true);
    // UT1 input: the bodies take the ΔT band, and the angles their rate on TT times it, as houses() gives them.
    const d = onUt1.chart.deltaT.sigma!;
    expect(onUt1.band.time).toEqual({ tt: d, ut1: 0 });
    onUt1.chart.bodies.forEach((row, index) => expect(onUt1.band.bodies[index]!.lon, row.body).toBe((Math.abs(row.speed) / 24) * d));
    const onUt1Angles = housesOk(houses({ time: { jd: 2_447_104.75, scale: "ut1" }, place })).band;
    expect([onUt1.band.asc, onUt1.band.mc]).toEqual([onUt1Angles.asc, onUt1Angles.mc]);
    expect(onUt1.band.asc).toBeGreaterThan(0);
    expect(onUt1.band.mc).toBeGreaterThan(0);
  });

  it("name time-band:first-order last in every receipt whose result carries a band", () => {
    const utc = "2000-01-01T12:00:00Z";
    const place = { latitude: 10, longitude: 10 };
    const found = events({ kind: "longitude-crossing", body: "Mars", longitude: 30, from: "2022-06-01", to: "2023-06-01" });
    const charted = chart({ time: utc, place });
    if (found.status !== "ok" || charted.status !== "ok") throw new Error("refused");
    for (const conventions of [
      ok(calc({ body: "Mars", time: utc })).receipt.conventions,
      housesOk(houses({ time: utc, place })).receipt.conventions,
      found.receipt.conventions,
      charted.receipt.conventions
    ]) {
      expect(conventions.at(-1)).toBe(BAND_ID);
      expect(conventions.filter((id) => id === BAND_ID)).toHaveLength(1);
    }
    expect(ok(calc({ body: "Mars", time: utc, flags: { speeds: false } })).receipt.conventions).not.toContain(BAND_ID);
  });
});

describe("typed refusals", () => {
  const time = "2000-01-01T00:00:00Z";

  it("compute the sidereal zodiac, named by ayanamsa, in every function (calc-sidereal.test.ts holds the values)", () => {
    for (const ayanamsa of CALC_AYANAMSAS) {
      const zodiac = { sidereal: ayanamsa };
      for (const result of [
        calc({ body: "Moon", time, zodiac }),
        houses({ time, place: { latitude: 0, longitude: 0 }, zodiac }),
        events({ kind: "longitude-crossing", body: "Sun", longitude: 0, from: time, to: "2000-02-01", zodiac }),
        chart({ time, zodiac })
      ]) {
        expect(result.status).toBe("ok");
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

  it("refuse instants whose UT1 or TT is outside the span, and compute its first instant", () => {
    const first = 2_378_496.5; // 1800-01-01T00:00
    const last = 2_524_593.5; // 2200-01-01T00:00
    const outside = [
      "1799-12-31T23:59:59.999Z",
      CALC_SPAN.to,
      "2199-12-31T23:59:59Z", // TT 126 s later, in 2200
      { jd: 2378496.4, scale: "utc" },
      { jd: first, scale: "tt" }, // UT1 18.7 s earlier, in 1799
      { jd: last, scale: "tt" },
      { jd: last + 2 / 1440, scale: "tt" }, // UT1 still in 2199
      { jd: first + 30 / 86_400, scale: "ut1", deltaT: -60 }, // TT in 1799
      { jd: 1e300, scale: "tt" },
      { jd: -1e300, scale: "utc" },
      { jd: 2451545, scale: "tt", deltaT: 1e10 },
      { iso: "2199-06-01T00:00:00Z", deltaT: 1e10 }, // TT in 2516
      { iso: "1800-06-01T00:00:00Z", deltaT: -1e10 }
    ] as const;
    for (const t of outside) {
      const result = refused(calc({ body: "Moon", time: t }));
      expect(result).toMatchObject({ reason: "out-of-range", span: { from: CALC_SPAN.from, to: CALC_SPAN.to } });
    }
    for (const t of [CALC_SPAN.from, "2199-12-31T23:57:00Z", { jd: first + 30 / 86_400, scale: "tt" }, { jd: last - 1 / 86_400, scale: "tt" }] as const) {
      ok(calc({ body: "Moon", time: t }));
    }
    expect(refused(houses({ time: { iso: "2199-06-01T00:00:00Z", deltaT: 1e10 }, place: { latitude: 0, longitude: 0 } })).reason).toBe("out-of-range");
    expect(refused(chart({ time: { jd: last, scale: "tt" } })).reason).toBe("out-of-range");
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
    ["an unknown time scale", { body: "Sun", time: { jd: 2451545, scale: "UT" } }],
    ["a time scale in upper case, as before 1.0.0", { body: "Sun", time: { jd: 2451545, scale: "UTC" } }],
    ["TT in upper case", { body: "Sun", time: { jd: 2451545, scale: "TT" } }],
    ["a non-finite Julian date", { body: "Sun", time: { jd: Number.NaN, scale: "tt" } }],
    ["both iso and jd", { body: "Sun", time: { iso: time, jd: 2451545, scale: "tt" } }],
    ["a non-finite ΔT", { body: "Sun", time: { iso: time, deltaT: Number.POSITIVE_INFINITY } }],
    ["a latitude out of range", { body: "Moon", time, center: { topocentric: { latitude: 91, longitude: 0 } } }],
    ["a height out of range", { body: "Moon", time, center: { topocentric: { latitude: 0, longitude: 0, height: 1e6 } } }],
    ["an unknown ayanamsa", { body: "Sun", time, zodiac: { sidereal: "lahiri-1940" } }]
  ])("for %s", (_, request) => {
    expect(() => calc(request as never)).toThrow(RangeError);
  });

  it("in houses, events and chart too", () => {
    expect(() => houses({ time, place: { latitude: 0, longitude: 0 }, houseSystem: "koch-2" as never })).toThrow(RangeError);
    // The field is houseSystem, as in chart() and natalChart(), from 1.0.0.
    expect(() => houses({ time, place: { latitude: 0, longitude: 0 }, system: "koch" } as never)).toThrow(/takes only time, place, houseSystem, zodiac/);
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
