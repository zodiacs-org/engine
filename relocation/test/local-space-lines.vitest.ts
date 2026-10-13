import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart } from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import * as calcEngine from "@zodiacs/engine/calc";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import { AngularBudgetError, LOCAL_SPACE_CONVENTIONS, MAX_ANGLE_EVALUATIONS, localSpaceLines,
  planLocalSpaceLines, sampleAngles, wrapLongitude } from "../src/index.js";
import type { GeographicPoint, LocalSpaceLineOptions, LocalSpaceLinesResult } from "../src/index.js";
import { azimuthArc } from "../src/local-space-geometry.js";
import { pathPolylines } from "../src/great-circle.js";

vi.mock("@zodiacs/engine/calc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zodiacs/engine/calc")>();
  return { ...actual, calc: vi.fn(actual.calc), houses: vi.fn(actual.houses) };
});
const actual = await vi.importActual<typeof calcEngine>("@zodiacs/engine/calc");

// Invented birth. Engine parity is regression evidence, not astronomical accuracy evidence.
const instant = "2004-05-06T07:08:09.010Z";
const birth: BirthInput = { utc: instant, latitude: 12, longitude: 34, houseSystem: "placidus", deltaT: 65 };
const options: LocalSpaceLineOptions = { origin: { latitude: 24, longitude: 172 },
  lengthDegrees: 40, stepDegrees: 20, bodies: ["Sun", "Moon"], maxEvaluations: 15 };
const rad = Math.PI / 180;
const vector = (point: GeographicPoint) => [Math.cos(point.latitude * rad) * Math.cos(point.longitude * rad),
  Math.cos(point.latitude * rad) * Math.sin(point.longitude * rad), Math.sin(point.latitude * rad)];
function distance(a: GeographicPoint, b: GeographicPoint) {
  const hav = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0, 1 - hav))) / rad;
}
function bearing(a: GeographicPoint, b: GeographicPoint) {
  const d = (b.longitude - a.longitude) * rad;
  const y = Math.sin(d) * Math.cos(b.latitude * rad);
  const x = Math.cos(a.latitude * rad) * Math.sin(b.latitude * rad)
    - Math.sin(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.cos(d);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
function ok(result: LocalSpaceLinesResult) {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}
function artificialSeed(ra: number, dec: number, armc = 0) {
  const position = actual.calc({ body: "Sun", time: instant, frame: "equatorial-true-of-date" });
  const observer = actual.houses({ time: instant, place: options.origin });
  if (position.status !== "ok" || observer.status !== "ok") throw new Error("Expected engine results");
  // Geometry branch injection only. These modified values are not authentic receipts.
  vi.mocked(calcEngine.calc).mockReturnValueOnce({ ...position, lon: ra, lat: dec });
  vi.mocked(calcEngine.houses).mockReturnValueOnce({ ...observer, armc });
}
afterEach(() => vi.restoreAllMocks());

describe("engine-backed local-space lines", () => {
  it("uses origin azimuths, shares the origin and preserves every fresh engine receipt", () => {
    const result = ok(localSpaceLines(birth, options));
    expect(result.schema).toBe("zodiacs.relocation-local-space.v1");
    expect(result.conventions).toEqual(LOCAL_SPACE_CONVENTIONS);
    expect(result.plan.requiredEvaluations).toBe(15);
    expect(result.plan.maximumObserverSamples).toBe(13);
    expect(result.sampling.evaluations).toEqual({ positions: 2, houses: 9 });
    expect(calcEngine.calc).toHaveBeenCalledTimes(2);
    expect(calcEngine.houses).toHaveBeenCalledTimes(9);
    expect(result.lines.map((line) => [line.body, line.direction])).toEqual([
      ["Sun", "forward"], ["Sun", "opposite"], ["Moon", "forward"], ["Moon", "opposite"]
    ]);
    for (const position of result.sampling.positions) expect(position.engine).toEqual(actual.calc(position.engine.receipt.request));
    for (const observer of result.sampling.samples) {
      if (observer.status !== "ok") throw new Error(observer.reason);
      expect(observer.engine).toEqual(actual.houses(observer.engine.receipt.request));
      expect(observer.engine.receipt.instants).toEqual(result.sampling.positions[0]!.engine.receipt.instants);
    }
    const origin = result.sampling.samples[0]!;
    if (origin.status !== "ok") throw new Error(origin.reason);
    for (const line of result.lines) {
      expect(line.status).toBe("sampled");
      expect(line.reason).toBeNull();
      expect(line.originObserverIndex).toBe(0);
      expect(line.samples[0]!.observerIndex).toBe(0);
      expect(line.samples.map((sample) => sample.distanceDegrees)).toEqual([0, 20, 40]);
      expect(line.originAzimuth).toBe(origin.bodies[line.positionIndex]!.azimuth);
      expect(line.bearing).toBe((line.originAzimuth! + (line.direction === "opposite" ? 180 : 0)) % 360);
      const first = result.sampling.samples[line.samples[1]!.observerIndex]!.point;
      expect(wrapLongitude(bearing(options.origin, first) - line.bearing!)).toBeCloseTo(0, 11);
      // Independent geographic arc plane, distances, and local astronomical projection.
      const a = vector(options.origin);
      const b = vector(first);
      const plane = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
      for (const sample of line.samples) {
        const observer = result.sampling.samples[sample.observerIndex]!;
        if (observer.status !== "ok") throw new Error(observer.reason);
        const p = vector(observer.point);
        expect(p.reduce((sum, n, i) => sum + n * plane[i]!, 0)).toBeCloseTo(0, 13);
        expect(distance(options.origin, observer.point)).toBeCloseTo(sample.distanceDegrees, 11);
        expect(sample.fraction).toBe(sample.distanceDegrees / 40);
        expect(sample.residual).toBeCloseTo(0, 9);
        const position = result.sampling.positions[line.positionIndex]!;
        const h = (observer.engine.armc - position.rightAscension!) * rad;
        const east = -Math.cos(position.declination * rad) * Math.sin(h);
        const north = Math.cos(observer.point.latitude * rad) * Math.sin(position.declination * rad)
          - Math.sin(observer.point.latitude * rad) * Math.cos(position.declination * rad) * Math.cos(h);
        expect(wrapLongitude(Math.atan2(east, north) / rad - sample.bodyAzimuth!)).toBeCloseTo(0, 11);
        expect(sample.bodyAzimuth).toBe(observer.bodies[line.positionIndex]!.azimuth);
      }
      for (const vertex of line.polylines.flat()) {
        if (vertex.source.kind === "sample") {
          const point = result.sampling.samples[vertex.source.index]!.point;
          expect(vertex.point.latitude).toBe(point.latitude);
          expect(wrapLongitude(vertex.point.longitude - point.longitude)).toBe(0);
        } else {
          const source = vertex.source;
          expect(line.samples.some((sample) => sample.observerIndex === source.fromIndex)).toBe(true);
          expect(line.samples.some((sample) => sample.observerIndex === source.toIndex)).toBe(true);
        }
      }
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("supports arbitrary relocated origins, source forms, source ownership and engine clock replay", () => {
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      const chart = natalChart({ ...birth, timeScale });
      const envelope = createNatalEnvelope(chart);
      const input = { ...options, bodies: ["Sun"] as const, directions: ["opposite"] as const, maxEvaluations: 5 };
      const fromBirth = ok(localSpaceLines({ ...birth, timeScale }, input));
      const fromChart = ok(localSpaceLines(chart, input));
      const fromEnvelope = ok(localSpaceLines(envelope, input));
      expect(fromChart.lines).toEqual(fromBirth.lines);
      expect(fromEnvelope.lines).toEqual(fromBirth.lines);
      expect(fromEnvelope.sampling.time).toEqual(fromBirth.sampling.time);
      const direct = sampleAngles({ ...birth, timeScale }, [options.origin], { bodies: ["Sun"], maxEvaluations: 2 });
      if (direct.status !== "ok") throw new Error(direct.reason);
      expect(fromBirth.sampling.samples[0]).toEqual(direct.samples[0]);
      expect(fromBirth.sampling.positions).toEqual(direct.positions);
      expect(fromBirth.sampling.natal.receipt.timeScale).toBe(timeScale);
      const snapshot = structuredClone(fromEnvelope);
      envelope.result.bodies[0]!.lon = 0;
      expect(fromEnvelope).toEqual(snapshot);
      for (const observer of fromBirth.sampling.samples) {
        if (observer.status !== "ok") throw new Error(observer.reason);
        expect(observer.engine).toEqual(actual.houses(observer.engine.receipt.request));
        expect(observer.engine.receipt.request.time).toEqual(fromBirth.sampling.time);
      }
    }
  });

  it("retains polar fallback near both poles and masks exact polar origins without choosing bearings", () => {
    for (const latitude of [-89.999999, 89.999999]) {
      const result = ok(localSpaceLines({ ...birth, latitude: 89, houseSystem: "koch" }, {
        ...options, origin: { latitude, longitude: -175 }, bodies: ["Sun"], lengthDegrees: 1,
        stepDegrees: 0.5, directions: ["forward"], maxEvaluations: 5
      }));
      expect(result.sampling.natal.receipt.houses.actual).toBe("whole");
      expect(result.lines[0]!.bearing).not.toBeNull();
      for (const observer of result.sampling.samples) {
        if (observer.status !== "ok") throw new Error(observer.reason);
        expect(observer.engine).toMatchObject({ requested: "koch", system: "whole" });
      }
    }
    for (const latitude of [-90, 90]) {
      vi.clearAllMocks();
      const result = ok(localSpaceLines(birth, { ...options, origin: { latitude, longitude: 15 }, maxEvaluations: 2 }));
      expect(result.plan.distances).toEqual([]);
      expect(result.plan.requiredEvaluations).toBe(2);
      expect(result.sampling.evaluations).toEqual({ positions: 2, houses: 0 });
      expect(calcEngine.houses).not.toHaveBeenCalled();
      expect(result.sampling.samples).toHaveLength(1);
      for (const line of result.lines) expect(line).toMatchObject({ status: "undefined", reason: "geographic-pole",
        bearing: null, originAzimuth: null, samples: [], polylines: [] });
    }
  });

  it("inserts meridional poles, breaks geometry and keeps undefined observer provenance", () => {
    for (const sign of [-1, 1]) {
      artificialSeed(0, sign * 85);
      const result = ok(localSpaceLines(birth, { ...options, origin: { latitude: sign * 80, longitude: 15 },
        bodies: ["Sun"], directions: ["forward"], lengthDegrees: 25, stepDegrees: 25, maxEvaluations: 4 }));
      const line = result.lines[0]!;
      expect(line.bearing).toBe(sign === 1 ? 0 : 180);
      expect(line.samples.map((sample) => sample.distanceDegrees)).toEqual([0, 10, 25]);
      expect(line.samples[1]).toMatchObject({ status: "undefined", reason: "geographic-pole",
        courseAzimuth: null, bodyAzimuth: null, azimuthUndefined: "geographic-pole", residual: null });
      expect(result.sampling.samples[line.samples[1]!.observerIndex]).toMatchObject({
        point: { latitude: sign * 90, longitude: 0 }, status: "undefined", engine: null
      });
      expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 2 });
      expect(line.polylines.map((segment) => segment.length)).toEqual([1, 1]);
      const end = result.sampling.samples[line.samples[2]!.observerIndex]!.point;
      expect(end).toEqual({ latitude: sign * 75, longitude: -165 });
    }
    artificialSeed(0, 85);
    const onRow = ok(localSpaceLines(birth, { ...options, origin: { latitude: 80, longitude: 15 }, bodies: ["Sun"],
      directions: ["forward"], lengthDegrees: 20, stepDegrees: 10, maxEvaluations: 5 }));
    expect(onRow.lines[0]!.samples.map((sample) => sample.distanceDegrees)).toEqual([0, 10, 20]);
    artificialSeed(0, 85);
    const endpoint = ok(localSpaceLines(birth, { ...options, origin: { latitude: 80, longitude: 15 }, bodies: ["Sun"],
      directions: ["forward"], lengthDegrees: 10, stepDegrees: 10, maxEvaluations: 4 }));
    expect(endpoint.lines[0]!.samples.at(-1)).toMatchObject({ status: "undefined", reason: "geographic-pole" });
    expect(endpoint.sampling.evaluations).toEqual({ positions: 1, houses: 1 });
    expect(endpoint.lines[0]!.polylines).toEqual([[{ point: { latitude: 80, longitude: 15 }, source: { kind: "sample", index: 0 } }]]);
  });

  it("reports undefined zenith and nadir origins without fabricating routes", () => {
    for (const [ra, dec] of [[0, 24], [180, -24]] as const) {
      artificialSeed(ra, dec);
      const result = ok(localSpaceLines(birth, { ...options, bodies: ["Sun"], maxEvaluations: 8 }));
      expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 1 });
      for (const line of result.lines) expect(line).toMatchObject({ status: "undefined", reason: "zenith-or-nadir",
        originAzimuth: null, bearing: null, samples: [], polylines: [] });
    }
  });

  it("allows a celestial-pole direction's local north bearing while refusing its RA", () => {
    artificialSeed(12, 90);
    const result = ok(localSpaceLines(birth, { ...options, bodies: ["Sun"], directions: ["forward"], maxEvaluations: 5 }));
    expect(result.sampling.positions[0]).toMatchObject({ rightAscension: null, raUndefined: "celestial-pole" });
    expect(result.lines[0]).toMatchObject({ status: "sampled", bearing: 0 });
  });

  it("retains defined routes through downstream zenith and nadir samples", () => {
    // A fixed north celestial direction gives a meridional route. Inject a
    // downstream observer ARMC so the artificial direction meets the zenith.
    artificialSeed(0, 30);
    const downstream = actual.houses({ time: instant, place: { latitude: 30, longitude: 172 } });
    if (downstream.status !== "ok") throw new Error(downstream.reason);
    vi.mocked(calcEngine.houses).mockReturnValueOnce({ ...downstream, armc: 0 });
    const result = ok(localSpaceLines(birth, { ...options, bodies: ["Sun"], directions: ["forward"],
      lengthDegrees: 6, stepDegrees: 6, maxEvaluations: 4 }));
    expect(result.lines[0]!.samples[1]).toMatchObject({ status: "ok", reason: null, bodyAzimuth: null,
      azimuthUndefined: "zenith-or-nadir", residual: null });
    expect(result.lines[0]!.polylines.flat()).toHaveLength(2);
  });

  it("splits seam geometry with global receipt references and supports equivalent origin labels", () => {
    artificialSeed(90, 0);
    const result = ok(localSpaceLines(birth, { ...options, origin: { latitude: 0, longitude: 170 }, bodies: ["Sun"],
      directions: ["forward"], lengthDegrees: 25, stepDegrees: 20, maxEvaluations: 5 }));
    expect(result.lines[0]!.bearing).toBe(90);
    expect(result.lines[0]!.polylines).toHaveLength(2);
    const seams = result.lines[0]!.polylines.flat().filter((vertex) => vertex.source.kind === "seam");
    expect(seams.map((vertex) => vertex.point.longitude)).toEqual([180, -180]);
    expect(seams[0]!.source).toEqual({ kind: "seam", fromIndex: 0, toIndex: 1, fraction: 0.5 });
    expect(result.lines[0]!.samples.map((sample) => sample.distanceDegrees)).toEqual([0, 20, 25]);
    for (const longitude of [-180, 180]) {
      artificialSeed(90, 0);
      const alias = ok(localSpaceLines(birth, { ...options, origin: { latitude: 0, longitude }, bodies: ["Sun"],
        directions: ["forward"], lengthDegrees: 20, stepDegrees: 20, maxEvaluations: 4 }));
      expect(alias.lines[0]!.polylines).toHaveLength(1);
      expect(alias.lines[0]!.polylines[0]![0]!.point.longitude).toBe(-180);
      expect(alias.sampling.samples[0]!.point.longitude).toBe(longitude);
    }
  });

  it("uses the supplied bearing to resolve antipodal endpoints, and supports origin-only rays", () => {
    const result = ok(localSpaceLines(birth, { ...options, bodies: ["Sun"], lengthDegrees: 180,
      stepDegrees: 90, maxEvaluations: 8 }));
    for (const line of result.lines) {
      expect(line.samples.at(-1)!.distanceDegrees).toBe(180);
      expect(result.sampling.samples[line.samples.at(-1)!.observerIndex]!.point).toEqual({
        latitude: -options.origin.latitude, longitude: wrapLongitude(options.origin.longitude + 180)
      });
    }
    const one = ok(localSpaceLines(birth, { ...options, lengthDegrees: 0, stepDegrees: Number.MIN_VALUE, maxEvaluations: 3 }));
    expect(one.sampling.evaluations).toEqual({ positions: 2, houses: 1 });
    for (const line of one.lines) {
      expect(line.samples).toHaveLength(1);
      expect(line.samples[0]).toMatchObject({ observerIndex: 0, distanceDegrees: 0, fraction: 0 });
      expect(line.polylines).toEqual([[{ point: options.origin, source: { kind: "sample", index: 0 } }]]);
    }
  });

  it("refuses unknown time and typed engine refusals without partial lines or samples", () => {
    const unknown = localSpaceLines({ ...birth, timeKnown: false }, options);
    expect(unknown).toMatchObject({ status: "refused", reason: "unknown-time", lines: [],
      sampling: { positions: [], samples: [], evaluations: { positions: 0, houses: 0 } } });
    const outside = localSpaceLines({ ...birth, utc: "1700-01-01T00:00:00Z" }, options);
    expect(outside).toMatchObject({ status: "refused", reason: "engine-refusal", lines: [], sampling: { positions: [], samples: [] } });
    const refusal = actual.houses({ time: "1700-01-01T00:00:00Z", place: options.origin });
    if (refusal.status !== "refused") throw new Error("Expected typed refusal");
    vi.mocked(calcEngine.houses).mockImplementationOnce(actual.houses).mockReturnValueOnce(refusal);
    const partial = localSpaceLines(birth, options);
    expect(partial).toMatchObject({ status: "refused", reason: "engine-refusal", lines: [],
      sampling: { positions: [], samples: [], engineRefusal: refusal, evaluations: { positions: 2, houses: 2 } } });
  });

  it("preflights conservative work before reading the source and bounds infinitesimal steps", () => {
    const getter = vi.fn(() => instant);
    const source = Object.defineProperty({}, "utc", { get: getter }) as BirthInput;
    expect(() => localSpaceLines(source, { ...options, maxEvaluations: 14 })).toThrow(AngularBudgetError);
    expect(getter).not.toHaveBeenCalled();
    expect(() => planLocalSpaceLines({ ...options, stepDegrees: Number.MIN_VALUE })).toThrow(AngularBudgetError);
    expect(() => planLocalSpaceLines({ ...options, lengthDegrees: Number.MIN_VALUE })).toThrow(/precision/);
    expect(() => planLocalSpaceLines({ ...options, lengthDegrees: 180, stepDegrees: 0.001,
      maxEvaluations: MAX_ANGLE_EVALUATIONS })).toThrow(AngularBudgetError);
    expect(planLocalSpaceLines({ ...options, bodies: ["Sun"], directions: ["opposite"], maxEvaluations: 5 }))
      .toMatchObject({ distances: [0, 20, 40], maximumObserverSamples: 4, requiredEvaluations: 5 });
  });

  it.each([null, [], {}, { ...options, origin: null }, { ...options, origin: [] },
    { ...options, origin: { latitude: 91, longitude: 0 } }, { ...options, origin: { latitude: 0, longitude: 181 } },
    { ...options, origin: { latitude: 0, longitude: NaN } }, { ...options, lengthDegrees: -1 },
    { ...options, lengthDegrees: 181 }, { ...options, lengthDegrees: NaN }, { ...options, lengthDegrees: Infinity },
    { ...options, stepDegrees: 0 }, { ...options, stepDegrees: -1 }, { ...options, stepDegrees: 91 },
    { ...options, stepDegrees: Infinity }, { ...options, stepDegrees: NaN }, { ...options, maxEvaluations: 0 },
    { ...options, maxEvaluations: 1.5 }, { ...options, maxEvaluations: Infinity },
    { ...options, maxEvaluations: MAX_ANGLE_EVALUATIONS + 1 }, { ...options, bodies: [] },
    { ...options, bodies: ["Sun", "Sun"] }, { ...options, bodies: ["North Node"] },
    { ...options, directions: [] }, { ...options, directions: ["forward", "forward"] },
    { ...options, directions: ["east"] }, { ...options, directions: ["forward", "opposite", "forward"] }
  ])("rejects malformed plans: %j", (value) => {
    expect(() => planLocalSpaceLines(value as LocalSpaceLineOptions)).toThrow(RangeError);
  });

  it("owns submitted coordinate and selection arrays and rejects sparse or accessor entries", () => {
    const input = structuredClone(options);
    const result = ok(localSpaceLines(birth, input));
    const snapshot = structuredClone(result);
    (input.origin as { latitude: number }).latitude = -20;
    (input.bodies as string[])[0] = "Mars";
    expect(result).toEqual(snapshot);
    const getter = vi.fn(() => 0);
    const origin = Object.defineProperty({ longitude: 0 }, "latitude", { get: getter }) as GeographicPoint;
    expect(() => planLocalSpaceLines({ ...options, origin })).toThrow(RangeError);
    const directions = Object.defineProperty([], "0", { get: getter });
    expect(() => planLocalSpaceLines({ ...options, directions })).toThrow(RangeError);
    expect(() => planLocalSpaceLines({ ...options, directions: new Array(1) })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("directed spherical azimuth geometry", () => {
  it("preserves known half-world direction and global receipt indices in display geometry", () => {
    const samples = [{ index: 7, point: { latitude: 80, longitude: 15 } },
      { index: 12, point: { latitude: 75, longitude: -165 } }];
    const east = pathPolylines(samples, "east");
    const west = pathPolylines(samples, "west");
    expect(east).toHaveLength(2);
    expect(west).toHaveLength(1);
    const seams = east.flat().filter((vertex) => vertex.source.kind === "seam");
    expect(seams).toHaveLength(2);
    expect(seams[0]!.source).toEqual({ kind: "seam", fromIndex: 7, toIndex: 12, fraction: 165 / 180 });
    expect(seams[1]!.source).toEqual(seams[0]!.source);
    expect(east[0]![0]!.source).toEqual({ kind: "sample", index: 7 });
    expect(east[1]!.at(-1)!.source).toEqual({ kind: "sample", index: 12 });
  });

  it("matches independent haversine distance and forward bearing through an oblique arc", () => {
    for (const origin of [{ latitude: -31, longitude: 72 }, { latitude: 89.999999, longitude: 3 },
      { latitude: -74, longitude: -158 }]) {
      for (const azimuth of [0, 25, 90, 180, 245, 359.999999]) {
        const arc = azimuthArc(origin, azimuth, 175);
        for (const degrees of [1, 15, 47, 100, 175]) {
          const point = arc.at(degrees);
          expect(distance(origin, point)).toBeCloseTo(degrees, 9);
          // Inverse bearings become ill-conditioned very close to a pole.
          if (Math.abs(origin.latitude) < 89) expect(wrapLongitude(bearing(origin, point) - azimuth)).toBeCloseTo(0, 10);
          const next = arc.at(degrees + 0.001);
          expect(wrapLongitude(bearing(point, next) - arc.courseAt(degrees, point)!)).toBeCloseTo(0, 7);
        }
      }
    }
  });

  it("inserts exact pole endpoints but avoids inventing a pole for nearby meridional bearings", () => {
    const origin = { latitude: 80, longitude: 10 };
    expect(azimuthArc(origin, 0, 10).at(10)).toEqual({ latitude: 90, longitude: 0 });
    expect(azimuthArc(origin, 0, 10).interiorPole).toBeNull();
    expect(azimuthArc(origin, 0.000001, 20).interiorPole).toBeNull();
    expect(azimuthArc(origin, 0.000001, 20).at(10).latitude).toBeLessThan(90);
  });

  it("rejects displaced samples lost at floating-point precision", () => {
    const origin = { latitude: 24, longitude: 172 };
    expect(() => azimuthArc(origin, 90, 1e-20).at(1e-20)).toThrow(/precision/);
    artificialSeed(90, 0);
    expect(() => localSpaceLines(birth, { ...options, bodies: ["Sun"], directions: ["forward"],
      lengthDegrees: 1e-20, stepDegrees: 20, maxEvaluations: 4 })).toThrow(/precision/);
  });
});
