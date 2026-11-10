import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.js";
import * as receipt from "../../src/receipt.js";
import type { BirthInput, BodyPosition, ChartFlag } from "../../src/types.js";
import { castChart, castHarmonicChart } from "../src/engine.js";
import type { CastChartOptions, CastHarmonicOptions } from "../src/engine.js";

// Invented instant and location. Integration comparisons establish delegation
// and receipt preservation, not ephemeris accuracy. No astronomical values are
// pinned. The arithmetic test replaces longitudes and speeds with exact values.
const birth: BirthInput = {
  utc: "2002-04-06T03:00:00Z",
  latitude: 12,
  longitude: 24,
  houseSystem: "whole"
};

afterEach(() => vi.restoreAllMocks());

describe("engine source chart adapter", () => {
  it("casts once, captures the original engine envelope and preserves source body rows", () => {
    const cast = vi.spyOn(api, "natalChart");
    const capture = vi.spyOn(receipt, "createNatalEnvelope");
    const extra = vi.spyOn(api, "chartPoints");
    const result = castChart(birth);
    expect(cast).toHaveBeenCalledTimes(1);
    expect(cast).toHaveBeenCalledWith(birth);
    const chart = cast.mock.results[0]!.value as ReturnType<typeof api.natalChart>;
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(chart, undefined);
    expect(result.envelope).toBe(capture.mock.results[0]!.value);
    expect(result.points).toEqual(chart.bodies.map(({ body, lon, speed }) => ({ body, lon, speed })));
    expect(result.envelope.result.bodies).toEqual(chart.bodies);
    expect(result.envelope.result.angles).toEqual(chart.angles);
    expect(result.envelope.result.houses).toEqual(chart.houses);
    expect(result.envelope.result.aspects).toEqual(chart.aspects);
    expect(result.flags).toEqual(chart.flags);
    expect(extra).not.toHaveBeenCalled();
    expect(receipt.parseNatalEnvelope(receipt.serializeNatalEnvelope(result.envelope)))
      .toEqual({ ok: true, envelope: result.envelope });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.points)).toBe(true);
    expect(result.points.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(result.flags)).toBe(true);
  });

  it("passes explicit receipt context through and keeps the chart's pinned TT clock", () => {
    const capture = vi.spyOn(receipt, "createNatalEnvelope");
    const utc = "2002-04-06T05:00:00+02:00";
    const context = {
      sourceInstant: utc,
      provenance: { runtime: { name: "node", version: process.versions.node } },
      extensions: { purpose: "synthetic adapter test" }
    };
    const result = castChart({ ...birth, utc, timeScale: "tt", deltaT: 64 }, { receiptContext: context });
    expect(capture.mock.calls[0]?.[1]).toBe(context);
    expect(result.envelope.receipt.sourceInstant).toBe(utc);
    expect(result.envelope.receipt.timeScale).toBe("tt");
    expect(result.envelope.receipt.instant).toBe("2002-04-06T03:00:00.000Z");
    expect(result.envelope.result.deltaT?.model).toBe("pinned");
    expect(result.envelope.result.deltaT?.seconds).toBe(64);
    expect(result.envelope.result.timeScale?.input).toBe("tt");
    expect(result.envelope.extensions).toEqual(context.extensions);
    expect(result.envelope.extensions).not.toBe(context.extensions);
    expect(receipt.natalReplayInput(result.envelope)).toMatchObject({ timeScale: "tt", deltaT: 64 });
  });

  it("reuses chartPoints on the cast chart, omitting unknown angle and point speeds", () => {
    const cast = vi.spyOn(api, "natalChart");
    const extra = vi.spyOn(api, "chartPoints");
    const result = castChart(birth, { includeAngles: true, includeChartPoints: true });
    const chart = cast.mock.results[0]!.value as ReturnType<typeof api.natalChart>;
    expect(cast).toHaveBeenCalledTimes(1);
    expect(extra).toHaveBeenCalledTimes(1);
    expect(extra).toHaveBeenCalledWith(chart);
    expect(result.points.slice(chart.bodies.length, chart.bodies.length + 4)).toEqual([
      { body: "Ascendant", lon: chart.angles!.asc },
      { body: "Midheaven", lon: chart.angles!.mc },
      { body: "Descendant", lon: chart.angles!.dsc },
      { body: "Imum Coeli", lon: chart.angles!.ic }
    ]);
    const supplied = extra.mock.results[0]!.value as ReturnType<typeof api.chartPoints>;
    for (const point of supplied.points) {
      const adapted = result.points.find(({ body }) => body === point.point)!;
      expect(adapted.lon).toBe(point.lon);
      if (point.speed === null) {
        expect(Object.hasOwn(adapted, "speed")).toBe(false);
      } else {
        expect(adapted.speed).toBe(point.speed);
      }
    }
    // Supplementary points have their own rows and do not alter the natal record.
    expect(result.envelope.result.bodies).toEqual(chart.bodies);
    expect(new Set(result.points.map(({ body }) => body)).size).toBe(result.points.length);
  });

  it.each([
    { ...birth, timeKnown: false },
    { utc: birth.utc }
  ])("omits unavailable angles and timed points for %j", (input) => {
    const result = castChart(input, { includeAngles: true, includeChartPoints: true });
    expect(result.envelope.result.angles).toBeNull();
    expect(result.envelope.result.houses).toBeNull();
    for (const name of ["Ascendant", "Midheaven", "Descendant", "Imum Coeli", "Vertex", "Lot of Fortune"]) {
      expect(result.points.some(({ body }) => body === name)).toBe(false);
    }
    for (const name of ["Mean Node", "Mean South Node", "Black Moon Lilith"]) {
      expect(result.points.find(({ body }) => body === name)?.speed).toEqual(expect.any(Number));
    }
  });

  it("preserves time assertions, unknown time and reference coverage flags", () => {
    const result = castHarmonicChart({
      utc: "2301-04-06T03:00:00Z", timeKnown: false, flags: ["lmt", "lmt"]
    }, 3);
    expect(result.source.flags).toEqual(["lmt", "no-time", "outside-reference-span"]);
    expect(result.source.envelope.receipt.inputFlags).toEqual(["lmt"]);
    expect(result.source.envelope.receipt.resultFlags).toEqual(result.source.flags);
    expect(result.source.envelope.receipt.reference).toBe("supplied-instant");
    expect(result.source.envelope.receipt.houses.absenceReason).toBe("unknown-time");
  });

  it("retains the requested and computed systems for a polar fallback", () => {
    const result = castHarmonicChart({ ...birth, latitude: 78, houseSystem: "placidus" }, 2);
    expect(result.source.flags).toEqual(["polar-fallback"]);
    expect(result.source.envelope.receipt.houses).toEqual({
      requested: "placidus", actual: "whole", absenceReason: null
    });
    expect(receipt.natalReplayInput(result.source.envelope).houseSystem).toBe("placidus");
  });

  it("snapshots mutable birth inputs independently", () => {
    const utc = new Date(birth.utc);
    const flags: ChartFlag[] = ["lmt"];
    const input = { ...birth, utc, flags };
    const result = castChart(input);
    utc.setUTCFullYear(2010);
    input.latitude = 30;
    flags[0] = "dst-fold";
    expect(result.envelope.receipt.instant).toBe("2002-04-06T03:00:00.000Z");
    expect(result.envelope.receipt.coordinates).toEqual({ latitude: 12, longitude: 24 });
    expect(result.flags).toEqual(["lmt"]);
  });

  it("keeps the isolated ephemeris dependency at the engine's exact pin", () => {
    const rootPackage = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const ownPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const dependency = JSON.parse(readFileSync(new URL("../node_modules/astronomy-engine/package.json", import.meta.url), "utf8"));
    expect(ownPackage.dependencies["astronomy-engine"]).toBe(rootPackage.dependencies["astronomy-engine"]);
    expect(dependency.version).toBe(rootPackage.dependencies["astronomy-engine"]);
  });
});

describe("harmonic chart casting", () => {
  it("transforms hand-derived longitudes and speeds while retaining the source envelope", () => {
    const chart = api.natalChart(birth);
    // Replace only these numerical rows with invented exact arithmetic inputs.
    // The other rows and time metadata are not numerical accuracy expectations.
    const invented: BodyPosition[] = [
      { body: "Sun", lon: 10, lat: 0, speed: 0.25, retrograde: false, sign: "aries", degree: 10 },
      { body: "Moon", lon: 130, lat: 0, speed: -0.5, retrograde: true, sign: "leo", degree: 10 },
      { body: "Mercury", lon: 250, lat: 0, speed: 0, retrograde: false, sign: "sagittarius", degree: 10 }
    ];
    chart.bodies.splice(0, 3, ...invented);
    chart.aspects = [];
    const cast = vi.spyOn(api, "natalChart").mockReturnValue(chart);
    const capture = vi.spyOn(receipt, "createNatalEnvelope");
    const result = castHarmonicChart(birth, 3, { maxHarmonic: 3 });
    expect(cast).toHaveBeenCalledTimes(1);
    expect(cast).toHaveBeenCalledWith(birth);
    // 3*10=30; 3*130=390=360+30; 3*250=750=720+30.
    // d(N*longitude)/dt=N*speed: 3/4, -3/2 and zero degrees/day.
    expect(result.harmonicChart.points.slice(0, 3)).toEqual([
      { body: "Sun", sourceLon: 10, lon: 30, sourceSpeed: 0.25, speed: 0.75 },
      { body: "Moon", sourceLon: 130, lon: 30, sourceSpeed: -0.5, speed: -1.5 },
      { body: "Mercury", sourceLon: 250, lon: 30, sourceSpeed: 0, speed: 0 }
    ]);
    expect(result.harmonicChart.harmonic).toBe(3);
    expect(result.harmonicChart.maxHarmonic).toBe(3);
    expect(result.source.envelope).toBe(capture.mock.results[0]!.value);
    expect(result.source.envelope.result.bodies.slice(0, 3)).toEqual(invented);
    expect(Object.hasOwn(result.harmonicChart, "envelope")).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.harmonicChart)).toBe(true);
    expect(Object.isFrozen(result.harmonicChart.points)).toBe(true);
    expect(result.harmonicChart.points.every(Object.isFrozen)).toBe(true);
  });

  it("leaves unknown speeds absent from harmonic angle and point rows", () => {
    const result = castHarmonicChart(birth, 2, { includeAngles: true, includeChartPoints: true });
    for (const point of result.harmonicChart.points) {
      const source = result.source.points.find(({ body }) => body === point.body)!;
      if (source.speed === undefined) {
        expect(Object.hasOwn(point, "speed")).toBe(false);
        expect(Object.hasOwn(point, "sourceSpeed")).toBe(false);
      } else {
        expect(point.sourceSpeed).toBe(source.speed);
        expect(point.speed).toBe(2 * source.speed);
      }
    }
    const unknown = result.harmonicChart.points.filter((point) => !Object.hasOwn(point, "speed"));
    expect(unknown.map(({ body }) => body)).toContain("Vertex");
    expect(unknown.map(({ body }) => body)).toContain("Ascendant");
  });

  it("delegates birth and receipt validation to the engine", () => {
    expect(() => castChart({ ...birth, utc: "2002-02-30T03:00:00Z" })).toThrow(RangeError);
    expect(() => castChart({ ...birth, flags: ["no-time"] })).toThrow(RangeError);
    expect(() => castChart(birth, { receiptContext: { sourceInstant: "2003-04-06T03:00:00Z" } }))
      .toThrow(receipt.NatalEnvelopeError);
  });

  it.each([0, 1.5, 181, NaN, Infinity])("rejects harmonic %s before casting", (harmonic) => {
    const cast = vi.spyOn(api, "natalChart");
    expect(() => castHarmonicChart(birth, harmonic)).toThrow(RangeError);
    expect(cast).not.toHaveBeenCalled();
  });

  it.each([null, [], "options", { includeAngles: null }, { includeChartPoints: 1 }])(
    "rejects malformed casting options %j before casting", (options) => {
      const cast = vi.spyOn(api, "natalChart");
      expect(() => castChart(birth, options as unknown as CastChartOptions)).toThrow(RangeError);
      expect(() => castHarmonicChart(birth, 3, options as unknown as CastHarmonicOptions)).toThrow(RangeError);
      expect(cast).not.toHaveBeenCalled();
    }
  );

  it("rejects an invalid ceiling before casting and honors an extended ceiling", () => {
    const cast = vi.spyOn(api, "natalChart");
    expect(() => castHarmonicChart(birth, 4, { maxHarmonic: 3 })).toThrow(RangeError);
    expect(cast).not.toHaveBeenCalled();
    const result = castHarmonicChart(birth, 720, { maxHarmonic: 720 });
    expect(cast).toHaveBeenCalledTimes(1);
    expect(result.harmonicChart.maxHarmonic).toBe(720);
    expect(result.harmonicChart.harmonic).toBe(720);
  });
});
