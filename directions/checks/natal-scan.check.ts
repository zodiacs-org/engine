import { describe, expect, it } from "vitest";
import { HIT_EXAMPLES, HIT_FIXTURE_ARC_TOLERANCE_DEGREES,
  HIT_FIXTURE_TIMING_RELATIVE_TOLERANCE, type HitExample } from "../evidence/hit-examples.js";
import { hitFromNatal, type NatalHitSelection } from "../src/natal-hit.js";
import { prepareNatal, type NatalSnapshot } from "../src/natal.js";
import { parseNatalScan, scanFromNatal,
  type NatalScanInput, type NatalScanResult } from "../src/natal-scan.js";

const selection = {
  significator: { kind: "body", id: "Moon" }, promissor: { kind: "body", id: "Sun" },
  contact: { kind: "conjunction" }
} as const;
const base = {
  convention: { system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", key: "ptolemy" },
  selections: [selection], motions: [{ motion: "direct" }], yearUnit: "julian-365.25-days",
  ageRange: { fromYears: 0, toYears: 1000, includeFrom: true, includeTo: true }, maxEvaluations: 20
} as const satisfies NatalScanInput;

function complete(result: NatalScanResult) {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(JSON.stringify(result));
  return result;
}

// Only consumed snapshot fields are required by the pure selection API. These
// are supplied synthetic sphere assertions, not a chart calculated by the engine.
// The ecliptic coordinates of mundane fixtures use zero obliquity, so their
// longitude/latitude equal RA/declination. No house cusp is supplied or used.
function sphereSnapshot(example: HitExample): NatalSnapshot {
  if ("angle" in example.significator) throw new Error("This helper accepts body fixtures only.");
  const points = [example.significator, example.promissor].map((point, index) => ({
    body: index === 0 ? "Moon" : "Sun",
    lon: "longitudeDegrees" in point ? point.longitudeDegrees : point.rightAscensionDegrees,
    lat: "latitudeDegrees" in point ? point.latitudeDegrees : point.declinationDegrees,
    ra: "rightAscensionDegrees" in point ? point.rightAscensionDegrees : 0,
    dec: "declinationDegrees" in point ? point.declinationDegrees : 0,
    raDefined: true
  }));
  const instant = "2000-01-01T12:00:00.000Z";
  const deltaT = { seconds: 64, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" };
  const trueObliquity = example.geometry.trueObliquityDegrees ?? 0;
  return {
    chart: { input: { utc: instant, timeKnown: true, timeScale: "ut1", longitude: 0,
      latitude: example.geometry.latitudeDegrees, houseSystem: "whole" },
      bodies: points.map(({ body, lon, lat }) => ({ body, lon, lat })), houses: { system: "whole" },
      flags: [], engineVersion: "synthetic-sphere-fixture", deltaT,
      timeScale: { input: "ut1", basis: "pinned", ut1MinusUtc: null, leapSeconds: null } },
    equatorial: { rows: points, trueObliquity, utc: instant, deltaT,
      convention: "true-equator-and-equinox-of-date; full-ecliptic-longitude-and-latitude" },
    geometry: { ...example.geometry, longitudeDegrees: 0, trueObliquityDegrees: trueObliquity },
    provenance: { engineVersion: "synthetic-sphere-fixture", ephemeris: { name: "astronomy-engine", version: "2.1.19" },
      chart: "@zodiacs/engine:natalChart", equatorial: "@zodiacs/engine:chartDeclinations",
      ramc: "@zodiacs/engine:eclipticToEquatorial(mc,0,trueObliquity)",
      inputInstant: "chart.input.utc is an ISO label on chart.timeScale.input" }
  } as unknown as NatalSnapshot;
}

function fixtureRequest(example: HitExample): NatalScanInput {
  return {
    ...base,
    convention: { system: example.system, mode: example.mode, latitude: example.latitude, key: example.key },
    selections: [{ ...selection, contact: example.contact }], yearUnit: example.yearUnit,
    motions: [example.motion === "direct" ? { motion: "direct" }
      : { motion: "converse", converseConstruction: "placidus-role-swap" }],
    ...(example.solar ? { solar: example.solar } : {})
  } as NatalScanInput;
}

describe("natal scan on independently derived supplied sphere examples", () => {
  for (const example of HIT_EXAMPLES as readonly HitExample[]) {
    if ("angle" in example.significator) continue;
    it(`preserves the independently derived ${example.id} arc and age`, () => {
      const result = complete(scanFromNatal(sphereSnapshot(example), fixtureRequest(example)));
      expect(result.hits).toHaveLength(1);
      const row = result.hits[0]!;
      expect(Math.abs(row.hit.arcDegrees - example.expected.arcDegrees))
        .toBeLessThanOrEqual(HIT_FIXTURE_ARC_TOLERANCE_DEGREES);
      const age = example.expected.directedAgeYears.numerator / example.expected.directedAgeYears.denominator;
      expect(Math.abs(row.hit.directedAgeYears - age))
        .toBeLessThanOrEqual(Math.max(1, Math.abs(age)) * HIT_FIXTURE_TIMING_RELATIVE_TOLERANCE);
      expect(row.hit.natal.source).toBe("supplied-natal-snapshot");
      expect(row.hit.natal.solarEpochAssociation).toBe(example.solar ? "caller-supplied-unverified" : null);
      expect(result.work).toEqual({ requestedEvaluations: 1, evaluated: 1, maxEvaluations: 20 });
    });
  }

  it("deduplicates before filtering and applies exact inclusive endpoints", () => {
    const example = HIT_EXAMPLES[0]; // M8 derivation: 20 degrees and Ptolemy years.
    const snapshot = sphereSnapshot(example);
    const request = fixtureRequest(example);
    const repeated = { ...request, selections: [...request.selections, ...request.selections],
      ageRange: { fromYears: 20, toYears: 20, includeFrom: true, includeTo: true } };
    const included = complete(parseNatalScan(snapshot, repeated));
    expect(included.hits).toHaveLength(1);
    expect(included.hits[0]).toMatchObject({ selectionIndex: 0, motionIndex: 0 });
    expect(included.duplicateCount).toBe(1);
    const excluded = complete(parseNatalScan(snapshot, { ...repeated,
      ageRange: { ...repeated.ageRange, includeTo: false } }));
    expect(excluded.hits).toEqual([]);
    expect(excluded.duplicateCount).toBe(1);
    expect(excluded.outsideAgeRangeCount).toBe(1);
  });
});

describe("natal scan engine integration and refusal contracts", () => {
  // Invented birth data. These are plumbing checks, not accuracy evidence.
  const snapshot = prepareNatal({ utc: "2000-01-01T12:00:00Z", timeScale: "ut1", timeKnown: true,
    latitude: 35, longitude: 15, houseSystem: "placidus", deltaT: 64 });

  it("enumerates each single natal hit once and retains its complete audit in age order", () => {
    const request = { ...base,
      selections: [selection, { ...selection, contact: { kind: "aspect", aspect: "square", branch: "eastward" } }],
      motions: [{ motion: "converse", converseConstruction: "placidus-role-swap" }, { motion: "direct" }]
    } as const satisfies NatalScanInput;
    const result = complete(scanFromNatal(snapshot, request));
    const expected = request.selections.flatMap((item, selectionIndex) => request.motions.map((motion, motionIndex) => ({
      selectionIndex, motionIndex,
      hit: hitFromNatal(snapshot, { convention: { ...request.convention, ...motion }, ...item,
        yearUnit: request.yearUnit } as NatalHitSelection)
    })));
    expected.sort((a, b) => {
      if (a.hit.status !== "ok" || b.hit.status !== "ok") throw new Error("Unexpected hit refusal");
      return a.hit.directedAgeYears - b.hit.directedAgeYears
        || a.selectionIndex - b.selectionIndex || a.motionIndex - b.motionIndex;
    });
    expect(result.hits).toEqual(expected);
    expect(result.work).toEqual({ requestedEvaluations: 4, evaluated: 4, maxEvaluations: 20 });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const row of result.hits) {
      expect(row.hit.natal.provenance).toEqual(snapshot.provenance);
      expect(Object.isFrozen(row.hit.natal.provenance.ephemeris)).toBe(true);
    }
  });

  it("retains zodiacal angle metadata and refuses converse angles atomically", () => {
    const request = { ...base, convention: { ...base.convention, mode: "zodiacal", latitude: "zero-both" },
      selections: [{ ...selection, significator: { kind: "angle", angle: "mc" } }] } as const satisfies NatalScanInput;
    const row = complete(scanFromNatal(snapshot, request)).hits[0]!;
    expect(row.hit.natal.significator).toEqual({ kind: "angle", angle: "mc", longitudeDegrees: snapshot.chart.angles.mc });
    expect(parseNatalScan(snapshot, { ...request,
      motions: [{ motion: "direct" }, { motion: "converse", converseConstruction: "placidus-role-swap" }] }))
      .toMatchObject({ status: "refused", code: "hit-refused", hits: [],
        work: { evaluated: 2 }, at: { selectionIndex: 0, motionIndex: 1 },
        cause: { status: "refused", stage: "angle" } });
  });

  it("returns no partial hits when a later selected body is absent", () => {
    expect(parseNatalScan(snapshot, { ...base,
      selections: [selection, { ...selection, promissor: { kind: "body", id: "Absent" } }] }))
      .toMatchObject({ status: "refused", stage: "scan", code: "hit-refused", hits: [],
        work: { requestedEvaluations: 2, evaluated: 2 }, at: { selectionIndex: 1, motionIndex: 0 },
        cause: { stage: "natal", code: "missing-body" } });
  });

  it("checks budget and scan structure before touching a snapshot", () => {
    let reads = 0;
    const unconsumable = Object.defineProperty({}, "chart", { get() { reads++; throw new Error("Read snapshot"); } });
    expect(parseNatalScan(unconsumable as NatalSnapshot, { ...base, selections: [selection, selection], maxEvaluations: 1 }))
      .toMatchObject({ status: "refused", code: "evaluation-budget", work: { evaluated: 0 } });
    expect(parseNatalScan(unconsumable as NatalSnapshot, { ...base, geometry: snapshot.geometry }))
      .toMatchObject({ status: "refused", code: "invalid-input" });
    expect(parseNatalScan(unconsumable as NatalSnapshot, { ...base, selections: [selection, { ...selection, extra: true }] }))
      .toMatchObject({ status: "refused", code: "invalid-input" });
    expect(reads).toBe(0);
  });

  it("rejects caller coordinate overrides, extra fields and misplaced motion", () => {
    for (const request of [
      { ...base, geometry: snapshot.geometry }, { ...base, extra: true },
      { ...base, convention: { ...base.convention, motion: "direct" } },
      { ...base, motions: [{ motion: "converse" }] },
      { ...base, ageRange: { fromYears: 0, toYears: 20 } }
    ]) expect(parseNatalScan(snapshot, request)).toMatchObject({ status: "refused", stage: "scan", code: "invalid-input" });
    expect(parseNatalScan(snapshot, { ...base, selections: [{ ...selection,
      promissor: { ...selection.promissor, coordinates: { rightAscensionDegrees: 0, declinationDegrees: 0 } } }] }))
      .toMatchObject({ status: "refused", code: "hit-refused", cause: { stage: "input", code: "invalid-input" } });
  });

  it("keeps inputs mutable while freezing every returned record", () => {
    const input = JSON.parse(JSON.stringify(base)) as NatalScanInput;
    const supplied = JSON.parse(JSON.stringify(snapshot)) as NatalSnapshot;
    const before = JSON.stringify([input, supplied]);
    const result = complete(scanFromNatal(supplied, input));
    expect(JSON.stringify([input, supplied])).toBe(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(supplied.geometry)).toBe(false);
    function frozen(value: unknown): void {
      if (value === null || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(frozen);
    }
    frozen(result);
  });
});
