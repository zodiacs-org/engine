import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  catalog, chartContactTargets, findStarContacts, natalStarHits, NATAL_STAR_CONVENTIONS, starPositions
} from "../src/index.js";
import type { CatalogStar, ContactOrbs } from "../src/index.js";
import {
  apply, chartDeclinations, createNatalEnvelope, eclipticRows, fromSpherical,
  natalChart, parseNatalEnvelope, serializeNatalEnvelope, toSpherical, transpose
} from "../src/engine.js";
import type { BirthInput, Chart } from "../src/engine.js";

const birth: BirthInput = {
  utc: "2000-03-20T06:00:00Z", latitude: 12, longitude: 30, houseSystem: "whole"
};
const allOrbs: ContactOrbs = { conjunctionDeg: 180, parallelDeg: 180 };
const disabled: ContactOrbs = { conjunctionDeg: null, parallelDeg: null };

// Synthetic direction records only; no historical lore is assigned to them.
function synthetic(id = "synthetic-star", raDeg = 0, decDeg = 0): CatalogStar {
  return { ...catalog[0]!, id, name: id, aliases: [], raDeg, decDeg,
    properMotion: null, historicalAttributions: [] };
}

function constructedChart(): { chart: Chart; epsilon: number } {
  // Read the existing independent reference, without copying it into this folder.
  const fixture = JSON.parse(readFileSync(new URL("../../src/fixtures/nutation-erfa.json", import.meta.url), "utf8")) as {
    epochs: { tt: number; epsA: number; deps: number }[];
  };
  const reference = fixture.epochs[0]!;
  expect(reference.tt).toBe(-73048.5); // Calendar arithmetic from J2000.
  const chart = natalChart({ utc: "1800-01-01T00:00:00Z", timeScale: "tt", deltaT: 0,
    latitude: 12, longitude: 30 });
  const directions = [[0, 0], [90, 0], [180, 0], [270, 0], [0, 30], [90, 30]];
  chart.bodies = chart.bodies.map((body, i) => ({ ...body,
    lon: directions[i]?.[0] ?? 0, lat: directions[i]?.[1] ?? 0 }));
  chart.angles = { asc: 0, mc: 90, dsc: 180, ic: 270 };
  // This is a coordinate-construction chart, not a receiptable natal ephemeris.
  return { chart, epsilon: (reference.epsA + reference.deps) / 3600 };
}

describe("hand-derived chart target geometry", () => {
  it("rotates cardinal ecliptic points and full body latitude using the chart clock", () => {
    const { chart, epsilon } = constructedChart();
    const targets = chartContactTargets(chart);
    const expected = [0, epsilon, 0, -epsilon,
      Math.asin(Math.cos(epsilon * Math.PI / 180) / 2) * 180 / Math.PI,
      epsilon + 30];
    for (const [i, dec] of expected.entries()) {
      expect(targets[i]!.decDeg).toBeCloseTo(dec, 10);
      expect(targets[i]!.lonDeg).toBe(chart.bodies[i]!.lon);
    }
    expect(targets.filter((row) => row.targetKind === "angle").map((row) => row.targetId))
      .toEqual(["Ascendant", "Midheaven", "Descendant", "Imum Coeli"]);
    for (const [i, dec] of [0, epsilon, 0, -epsilon].entries()) {
      expect(targets[chart.bodies.length + i]!.decDeg).toBeCloseTo(dec, 10);
    }
  });

  it("matches constructed coordinates with signed parallels and wraparound conjunctions", () => {
    const { chart } = constructedChart();
    const targets = chartContactTargets(chart);
    const stars = [{ starId: "synthetic-wrap", lonDeg: 359.5, decDeg: 0 }];
    const hits = findStarContacts(stars, targets, { conjunctionDeg: 0.5, parallelDeg: 1e-10 }).hits;
    expect(hits.filter((hit) => hit.targetKind === "angle" && hit.kind === "conjunction"))
      .toEqual([{ starId: "synthetic-wrap", targetId: "Ascendant", targetKind: "angle",
        kind: "conjunction", orbDeg: 0.5, maximumOrbDeg: 0.5 }]);
    expect(hits.filter((hit) => hit.targetKind === "angle" && hit.kind === "parallel").map((hit) => hit.targetId).sort())
      .toEqual(["Ascendant", "Descendant"]);
  });

  it("does not mutate or freeze a supplied chart", () => {
    const { chart } = constructedChart();
    const before = JSON.stringify(chart);
    const targets = chartContactTargets(chart);
    expect(JSON.stringify(chart)).toBe(before);
    expect(Object.isFrozen(chart.bodies)).toBe(false);
    expect(Object.isFrozen(chart.angles)).toBe(false);
    expect(Object.isFrozen(targets)).toBe(true);
    expect(targets.every(Object.isFrozen)).toBe(true);
    chart.bodies[0]!.lon = 1;
    chart.angles!.asc = 2;
    expect(targets[0]!.lonDeg).toBe(0);
    expect(targets.find((row) => row.targetId === "Ascendant")!.lonDeg).toBe(0);
  });

  it("refuses invalid angle coordinates and contradictory availability", () => {
    const { chart } = constructedChart();
    for (const input of [null, birth, { ...chart, aspects: null }]) {
      expect(() => chartContactTargets(input as unknown as Chart)).toThrow(RangeError);
    }
    for (const value of [NaN, Infinity, -1, 360]) {
      expect(() => chartContactTargets({ ...chart, angles: { ...chart.angles!, asc: value } })).toThrow(RangeError);
    }
    expect(() => chartContactTargets({ ...chart, angles: null })).toThrow(RangeError);
    expect(() => chartContactTargets({ ...chart, input: { ...chart.input, timeKnown: false } })).toThrow(RangeError);
  });
});

describe("natal hit assembly, engine integration rather than accuracy evidence", () => {
  it.each(["utc", "ut1", "tt"] as const)("retains the native chart and aligned %s clock with and without a pin", (timeScale) => {
    for (const pin of [undefined, 1234]) {
      const input = { ...birth, timeScale, ...(pin === undefined ? {} : { deltaT: pin }) };
      const result = natalStarHits(input, allOrbs, [synthetic()]);
      const chart = natalChart(input);
      const declinations = chartDeclinations(chart);
      const positions = starPositions(chart.input, [synthetic()]);
      expect(result.natal).toEqual(createNatalEnvelope(chart));
      expect(result.stellar).toEqual(positions);
      expect(result.stellar.timeBasis.deltaT).toEqual(chart.deltaT);
      expect(result.stellar.timeBasis.timeScale).toEqual(chart.timeScale);
      expect(result.stellar.trueObliquityDeg).toBe(declinations.trueObliquity);
      expect(result.targets.filter((row) => row.targetKind === "body")).toEqual(
        declinations.rows.map((row) => ({ targetId: row.body, targetKind: "body", lonDeg: row.lon, decDeg: row.dec }))
      );
      expect(result.targets).toHaveLength(16); // All 12 engine bodies and 4 angles.
      expect(result.hits).toHaveLength(32); // Both kinds for every target at half-circle limits.
      expect(result.targets.some((row) => row.targetId === "North Node")).toBe(true);
      expect(result.targets.some((row) => row.targetId === "South Node")).toBe(true);
      expect(result.hits).toEqual(findStarContacts(result.stellar.positions, result.targets, allOrbs).hits);
      const parsed = parseNatalEnvelope(serializeNatalEnvelope(result.natal));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.envelope).toEqual(result.natal);
      expect(result.conventions).toBe(NATAL_STAR_CONVENTIONS);
    }
  });

  it("finds contacts to constructed directions at a real engine body's and an angle's coordinates", () => {
    const initial = natalStarHits(birth, disabled, []);
    const tt = initial.stellar.timeBasis.ttDays;
    const inverse = transpose(eclipticRows(tt, "true"));
    const chart = initial.natal.result;
    const moon = chart.bodies.find((row) => row.body === "Moon")!;
    const coords = [["synthetic-moon", moon.lon, moon.lat], ["synthetic-asc", chart.angles!.asc, 0]] as const;
    const stars = coords.map(([id, lon, lat]) => {
      const direction = toSpherical(apply(inverse, fromSpherical(lon, lat, 1)));
      return synthetic(id, direction.lon, direction.lat);
    });
    const result = natalStarHits(birth, { conjunctionDeg: 1e-7, parallelDeg: 1e-7 }, stars);
    for (const [id, targetId, targetKind] of [
      ["synthetic-moon", "Moon", "body"], ["synthetic-asc", "Ascendant", "angle"]
    ]) for (const kind of ["conjunction", "parallel"]) {
      expect(result.hits).toContainEqual(expect.objectContaining({ starId: id, targetId, targetKind, kind }));
    }
  });

  it.each([
    [{ ...birth, timeKnown: false }, "unknown-time"],
    [{ utc: birth.utc }, "missing-location"]
  ] as const)("omits unavailable angles and retains the native absence reason", (input, reason) => {
    const result = natalStarHits(input, allOrbs, [synthetic()]);
    expect(result.targets).toHaveLength(12);
    expect(result.hits).toHaveLength(24);
    expect(result.targets.every((row) => row.targetKind === "body")).toBe(true);
    expect(result.natal.result.angles).toBeNull();
    expect(result.natal.receipt.houses.absenceReason).toBe(reason);
    expect(result.natal.receipt.reference).toBe("supplied-instant");
    expect(result.natal.receipt.instant).toBe("2000-03-20T06:00:00.000Z");
  });

  it("preserves polar fallback and coverage flags in the native envelope", () => {
    const polar = natalStarHits({ ...birth, latitude: 78, houseSystem: "placidus" }, disabled, []);
    expect(polar.natal.receipt.houses).toEqual({ requested: "placidus", actual: "whole", absenceReason: null });
    expect(polar.natal.receipt.resultFlags).toContain("polar-fallback");
    expect(polar.targets.filter((row) => row.targetKind === "angle")).toHaveLength(4);
    const early = natalStarHits({ utc: "1700-03-20T06:00:00Z" }, disabled, []);
    expect(early.natal.receipt.resultFlags).toContain("outside-reference-span");
  });

  it("retains an ecliptic pole's null longitude and only reports parallels", () => {
    const initial = natalStarHits(birth, disabled, []);
    const pole = toSpherical(apply(transpose(eclipticRows(initial.stellar.timeBasis.ttDays, "true")), [0, 0, 1]));
    const result = natalStarHits(birth, allOrbs, [synthetic("synthetic-pole", pole.lon, pole.lat)]);
    expect(result.stellar.positions[0]!.lonDeg).toBeNull();
    expect(result.hits).toHaveLength(16);
    expect(result.hits.every((hit) => hit.kind === "parallel")).toBe(true);
  });

  it("defaults to the catalog, supports empty selections, and keeps disabled kinds empty", () => {
    const result = natalStarHits(birth, disabled);
    expect(result.stellar.positions.map((row) => row.starId)).toEqual(catalog.map((star) => star.id));
    expect(result.hits).toEqual([]);
    const empty = natalStarHits(birth, allOrbs, []);
    expect(empty.stellar.positions).toEqual([]);
    expect(empty.hits).toEqual([]);
    expect(empty.natal.result.bodies).toHaveLength(12);
  });

  it("captures the chart input once and leaves caller records mutable", () => {
    let utcReads = 0;
    const input = { ...birth, get utc() { utcReads++; return birth.utc; }, flags: ["lmt"] as const };
    const star = synthetic();
    const orbs = { ...allOrbs };
    const result = natalStarHits(input, orbs, [star]);
    expect(utcReads).toBe(1);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.flags)).toBe(false);
    expect(Object.isFrozen(star)).toBe(false);
    expect(Object.isFrozen(star.aliases)).toBe(false);
    expect(Object.isFrozen(orbs)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.natal.result.bodies[0])).toBe(true);
    expect(Object.isFrozen(result.stellar.timeBasis.deltaT)).toBe(true);
    Object.assign(star, { raDeg: 90 });
    expect(result.stellar.positions[0]!.directionJ2000[0]).toBe(1);
    orbs.conjunctionDeg = 0;
    expect(result.orbs.conjunctionDeg).toBe(180);
    expect(() => { result.natal.result.bodies[0]!.lon = 1; }).toThrow(TypeError);
  });

  it("rejects invalid policies, birth settings and star selections", () => {
    expect(() => natalStarHits({ utc: "invalid" }, {} as ContactOrbs, [])).toThrow(/Contact orbs/);
    for (const input of [
      { utc: "2000-02-30" }, { ...birth, timeScale: "invalid" }, { ...birth, latitude: 91 },
      { ...birth, timeKnown: null }, { ...birth, deltaT: NaN }, { ...birth, flags: ["no-time"] },
      { utc: "5000-01-01" }
    ]) expect(() => natalStarHits(input as BirthInput, disabled, [])).toThrow(RangeError);
    expect(() => natalStarHits(birth, disabled, [synthetic(), synthetic()])).toThrow(RangeError);
    expect(() => natalStarHits(birth, disabled, [synthetic(" invalid ")])).toThrow(RangeError);
    expect(() => natalStarHits(birth, disabled, [synthetic("synthetic", NaN)])).toThrow(RangeError);
    expect(() => natalStarHits(birth, disabled, null as unknown as CatalogStar[])).toThrow(RangeError);
  });
});
