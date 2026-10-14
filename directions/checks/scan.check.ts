import { describe, expect, it, vi } from "vitest";
import { scan, parseScan, hit, SCAN_MAX_EVALUATIONS } from "../src/index.js";
import type { ScanComplete, ScanInput, ScanResult, HitInput } from "../src/index.js";
import * as hitModule from "../src/hit.js";
import {
  SCAN_CONTACT_EXAMPLES, SCAN_GEOMETRY, SCAN_SIGNIFICATOR, SCAN_PROMISSOR,
  SCAN_SOLAR_SAMPLES, SCAN_SORTED_ROW_INDICES, SCAN_FIXTURE_ARC_TOLERANCE_DEGREES,
  SCAN_FIXTURE_TIMING_RELATIVE_TOLERANCE, SCAN_AGE_MULTIPLIERS
} from "../evidence/scan-examples.js";

const base = {
  convention: { system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", key: "ptolemy" },
  geometry: { ramcDegrees: 0, latitudeDegrees: 0 },
  selections: [{
    significator: { kind: "body", id: "S", coordinates: { rightAscensionDegrees: 330, declinationDegrees: 0 } },
    promissor: { kind: "body", id: "P", coordinates: { rightAscensionDegrees: 60, declinationDegrees: 0 } },
    contact: { kind: "conjunction" }
  }],
  motions: [{ motion: "direct" }, { motion: "converse", converseConstruction: "placidus-role-swap" }],
  yearUnit: "tropical-365.2422-days",
  ageRange: { fromYears: 0, toYears: 1000, includeFrom: true, includeTo: true }, maxEvaluations: 100
} as const satisfies ScanInput;

function complete(result: ScanResult): ScanComplete {
  expect(result.status, JSON.stringify(result)).toBe("complete");
  if (result.status !== "complete") throw new Error("Expected a complete scan");
  return result;
}

function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
}

function numeric(actual: number, expected: number, tolerance: number): void {
  if (expected === 0) expect(actual).toBe(0);
  else expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function enumeration() {
  return {
    ...base, geometry: SCAN_GEOMETRY,
    selections: SCAN_CONTACT_EXAMPLES.map(example => ({
      significator: SCAN_SIGNIFICATOR,
      promissor: SCAN_PROMISSOR,
      contact: example.contact
    }))
  };
}

describe("independently enumerated scans", () => {
  for (const key of ["ptolemy", "naibod", "solar-equatorial-birth-day"] as const) {
    for (const yearUnit of ["tropical-365.2422-days", "julian-365.25-days"] as const) {
      it(key + " / " + yearUnit, () => {
        const input = { ...enumeration(), convention: { ...base.convention, key }, yearUnit,
          ...(key === "solar-equatorial-birth-day" ? { solar: SCAN_SOLAR_SAMPLES } : {}) };
        const result = complete(parseScan(input));
        expect(result.hits.map(row => row.selectionIndex * 2 + row.motionIndex)).toEqual(SCAN_SORTED_ROW_INDICES);
        expect(result.work).toEqual({ requestedEvaluations: 16, evaluated: 16, maxEvaluations: 100 });
        expect(result.duplicateCount).toBe(0);
        expect(result.outsideAgeRangeCount).toBe(0);
        for (const row of result.hits) {
          const example = SCAN_CONTACT_EXAMPLES[row.selectionIndex]!;
          const expected = example.expected[row.motionIndex === 0 ? "direct" : "converse"];
          numeric(row.hit.arcDegrees, expected.arcDegrees, SCAN_FIXTURE_ARC_TOLERANCE_DEGREES);
          numeric(row.hit.geometry.calculation.geometry.targetHourAngleDegrees, expected.targetHourAngleDegrees,
            SCAN_FIXTURE_ARC_TOLERANCE_DEGREES);
          if (row.hit.geometry.solver !== "mundane-body") throw new Error("Expected a mundane body scan");
          numeric(row.hit.geometry.calculation.geometry.targetSemiArcPositionDegrees,
            expected.targetProportionalPositionDegrees, SCAN_FIXTURE_ARC_TOLERANCE_DEGREES);
          const multiplier = SCAN_AGE_MULTIPLIERS[key];
          const numerator = expected.arcDegrees * multiplier.numerator;
          const denominator = multiplier.denominator;
          expect(row.hit.timing.rateDegreesPerYear).toBe(multiplier.denominator / multiplier.numerator);
          const age = numerator / denominator;
          numeric(row.hit.directedAgeYears, age, Math.abs(age) * SCAN_FIXTURE_TIMING_RELATIVE_TOLERANCE);
          const days = yearUnit === "tropical-365.2422-days"
            ? Number(BigInt(numerator) * 1826211n) / Number(BigInt(denominator) * 5000n)
            : Number(BigInt(numerator) * 1461n) / Number(BigInt(denominator) * 4n);
          numeric(row.hit.timing.elapsedDays, days, Math.abs(days) * SCAN_FIXTURE_TIMING_RELATIVE_TOLERANCE);
          // API parity is a separate integration check, not the arc expectation.
          expect(row.hit).toEqual(hit({
            convention: { ...input.convention, ...input.motions[row.motionIndex] },
            geometry: input.geometry, ...input.selections[row.selectionIndex], yearUnit: input.yearUnit,
            ...(key === "solar-equatorial-birth-day" ? { solar: SCAN_SOLAR_SAMPLES } : {})
          } as HitInput));
        }
        frozen(result);
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      });
    }
  }

  it("enumerates zodiacal rays and fixed angular contacts through the single-hit API", () => {
    // Zero obliquity and zero observer latitude: RA equals longitude. S=330,
    // P=60, so direct conjunction is 90 and dexter square is already exact.
    // The same P reaches MC after 60, IC after 240, ASC after 330 and DSC after 150.
    const body = { kind: "body", id: "P", coordinates: { longitudeDegrees: 60, latitudeDegrees: -7 } } as const;
    const s = { kind: "body", id: "S", coordinates: { longitudeDegrees: 330, latitudeDegrees: 4 } } as const;
    const input = {
      ...base, convention: { ...base.convention, mode: "zodiacal", latitude: "zero-both" },
      geometry: { ...base.geometry, trueObliquityDegrees: 0 }, motions: [{ motion: "direct" }],
      selections: [
        { significator: s, promissor: body, contact: { kind: "conjunction" } },
        { significator: s, promissor: body, contact: { kind: "aspect", aspect: "square", branch: "dexter" } },
        ...(["mc", "ic", "asc", "dsc"] as const).map(angle => ({
          significator: { kind: "angle", angle }, promissor: body, contact: { kind: "conjunction" }
        } as const))
      ]
    } as const satisfies ScanInput;
    const result = complete(scan(input));
    expect(result.hits.map(row => [row.selectionIndex, row.hit.arcDegrees])).toEqual([
      [1, 0], [2, 60], [0, 90], [5, 150], [3, 240], [4, 330]
    ]);
    for (const row of result.hits) {
      expect(row.hit).toEqual(hit({ ...input.selections[row.selectionIndex]!,
        convention: { ...input.convention, motion: "direct" }, geometry: input.geometry, yearUnit: input.yearUnit }));
    }
  });
});

describe("range, order and identity policy", () => {
  for (const includeFrom of [false, true]) for (const includeTo of [false, true]) {
    it("filters exact endpoints " + includeFrom + "/" + includeTo, () => {
      const input = { ...enumeration(), ageRange: { fromYears: 30, toYears: 180, includeFrom, includeTo } };
      const expected = SCAN_SORTED_ROW_INDICES.filter(index => {
        const arc = SCAN_CONTACT_EXAMPLES[Math.floor(index / 2)]!.expected[index % 2 === 0 ? "direct" : "converse"].arcDegrees;
        return (includeFrom ? arc >= 30 : arc > 30) && (includeTo ? arc <= 180 : arc < 180);
      });
      const result = complete(parseScan(input));
      expect(result.hits.map(row => row.selectionIndex * 2 + row.motionIndex)).toEqual(expected);
      expect(result.outsideAgeRangeCount).toBe(16 - expected.length);
    });
    it("defines a zero-width age interval " + includeFrom + "/" + includeTo, () => {
      const result = complete(parseScan({ ...enumeration(), ageRange: { fromYears: -0, toYears: -0, includeFrom, includeTo } }));
      expect(result.hits.map(row => [row.selectionIndex, row.motionIndex])).toEqual(includeFrom && includeTo ? [[3, 0], [3, 1]] : []);
      expect(result.ageRange.fromYears).toBe(0);
      expect(result.ageRange.toYears).toBe(0);
    });
  }

  it("does not widen an endpoint or invent later revolutions", () => {
    // 90 + 2^-46 is the next binary64 value after the exact 90-year hit.
    const input = { ...base, motions: [{ motion: "direct" }] } as const;
    expect(complete(scan({ ...input, ageRange: { ...base.ageRange, fromYears: 90 + 2 ** -46 } })).hits).toEqual([]);
    expect(complete(scan({ ...input, ageRange: { ...base.ageRange, toYears: 90 - 2 ** -46 } })).hits).toEqual([]);
    expect(complete(scan({ ...input, ageRange: { ...base.ageRange, fromYears: 90, toYears: 90 } })).hits).toHaveLength(1);
    expect(complete(parseScan({ ...enumeration(), ageRange: { ...base.ageRange, fromYears: 360 } })).hits).toEqual([]);
  });

  it("deduplicates canonical requests before filtering but preserves tied identities", () => {
    const input = enumeration();
    const first = input.selections[0]!;
    // Reordered properties and negative zero are the same supplied coordinates.
    const reordered = { contact: first.contact, promissor: { coordinates: { declinationDegrees: -0, rightAscensionDegrees: 60 }, id: "P", kind: "body" },
      significator: { coordinates: { declinationDegrees: 0, rightAscensionDegrees: 330 }, id: "S", kind: "body" } };
    const result = complete(parseScan({ ...input,
      selections: [...input.selections, reordered, { ...first, promissor: { ...first.promissor, id: "Different P" } }],
      motions: [...input.motions, { motion: "direct" }] }));
    expect(result.work.evaluated).toBe(30);
    expect(result.duplicateCount).toBe(12);
    expect(result.hits).toHaveLength(18);
    expect(result.hits.filter(row => row.hit.directedAgeYears === 0).map(row => [row.selectionIndex, row.motionIndex]))
      .toEqual([[3, 0], [3, 1]]);
    expect(result.hits.filter(row => row.hit.directedAgeYears === 90).map(row => [row.selectionIndex, row.motionIndex]))
      .toEqual([[0, 0], [7, 1], [9, 0]]);
    const filtered = complete(parseScan({ ...input, selections: [first, reordered],
      ageRange: { ...base.ageRange, fromYears: 100, toYears: 200 } }));
    expect(filtered.hits).toEqual([]);
    expect(filtered.duplicateCount).toBe(2);
    expect(filtered.outsideAgeRangeCount).toBe(2);
  });

  it("preserves input order for tied ages and is deterministic", () => {
    const input = { ...enumeration(), motions: [...base.motions].reverse() };
    const result = complete(parseScan(input));
    expect(result.hits.filter(row => row.hit.directedAgeYears === 0).map(row => row.hit.convention.motion))
      .toEqual(["converse", "direct"]);
    expect(JSON.stringify(parseScan(input))).toBe(JSON.stringify(result));
    expect(JSON.stringify(parseScan(JSON.parse(JSON.stringify(input))))).toBe(JSON.stringify(result));
  });
});

describe("bounded work and atomic refusals", () => {
  it("refuses over-budget work before evaluating or reading a selected contact", () => {
    const solver = vi.spyOn(hitModule, "parseHit");
    const getter = vi.fn(() => { throw new Error("must not run"); });
    const selection = Object.defineProperty({}, "significator", { get: getter, enumerable: true });
    try {
      const result = parseScan({ ...base, selections: [selection], maxEvaluations: 1 });
      expect(result).toMatchObject({ status: "refused", code: "evaluation-budget", hits: [],
        work: { requestedEvaluations: 2, evaluated: 0, maxEvaluations: 1 } });
      expect(solver).not.toHaveBeenCalled();
      expect(getter).not.toHaveBeenCalled();
      frozen(result);
    } finally { solver.mockRestore(); }
  });

  it("counts duplicate and excluded requests at the exact budget and never silently truncates", () => {
    const solver = vi.spyOn(hitModule, "parseHit");
    const input = { ...base, selections: [base.selections[0], base.selections[0]], maxEvaluations: 4,
      ageRange: { ...base.ageRange, fromYears: 100, toYears: 200 } };
    try {
      const result = complete(scan(input));
      expect(solver).toHaveBeenCalledTimes(4);
      expect(result.work).toEqual({ requestedEvaluations: 4, evaluated: 4, maxEvaluations: 4 });
      expect(result.hits).toEqual([]);
      expect(result.duplicateCount).toBe(2);
      expect(result.outsideAgeRangeCount).toBe(2);
      solver.mockClear();
      expect(scan({ ...input, maxEvaluations: 3 })).toMatchObject({ code: "evaluation-budget", work: { evaluated: 0 } });
      expect(solver).not.toHaveBeenCalled();
    } finally { solver.mockRestore(); }
  });

  it("enforces the hard cap including huge sparse arrays without enumerating them", () => {
    expect(SCAN_MAX_EVALUATIONS).toBe(10000);
    const input = { ...base, maxEvaluations: SCAN_MAX_EVALUATIONS };
    expect(complete(scan(input)).work.maxEvaluations).toBe(10000);
    expect(parseScan({ ...input, maxEvaluations: SCAN_MAX_EVALUATIONS + 1 })).toMatchObject({ code: "invalid-input" });
    expect(parseScan({ ...input, selections: new Array(2 ** 32 - 1) })).toMatchObject({ code: "invalid-input" });
    expect(parseScan({ ...input, selections: new Array(10000), motions: new Array(10000) }))
      .toMatchObject({ code: "evaluation-budget", work: { requestedEvaluations: 100000000, evaluated: 0 } });
  });

  it("preserves an underlying refusal and discards earlier successes even outside the age range", () => {
    const result = parseScan({ ...base, selections: [base.selections[0], {
      ...base.selections[0], significator: { kind: "angle", angle: "mc" }
    }], ageRange: { ...base.ageRange, fromYears: 999, toYears: 1000 } });
    expect(result).toMatchObject({ status: "refused", code: "hit-refused", hits: [],
      at: { selectionIndex: 1, motionIndex: 1 }, work: { requestedEvaluations: 4, evaluated: 4 },
      cause: { stage: "angle", code: "unsupported-converse-angle" } });
    frozen(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("rejects conflicting coordinates across selections even when their ages are excluded", () => {
    const result = parseScan({ ...base, selections: [base.selections[0], {
      ...base.selections[0], significator: { ...base.selections[0].promissor,
        coordinates: { rightAscensionDegrees: 61, declinationDegrees: 0 } },
      promissor: { ...base.selections[0].significator }
    }], ageRange: { ...base.ageRange, fromYears: 999, toYears: 1000 } });
    expect(result).toMatchObject({ status: "refused", code: "inconsistent-body", hits: [],
      at: { selectionIndex: 1, motionIndex: 0 }, work: { evaluated: 3 } });
    frozen(result);
  });

  it("does not hide unexpected executable-input exceptions", () => {
    const problem = new Error("trusted proxy failure");
    expect(() => parseScan(new Proxy({}, { getPrototypeOf() { throw problem; } }))).toThrow(problem);
  });
});

describe("strict data and ownership", () => {
  it("requires every choice and refuses misspellings", () => {
    for (const field of Object.keys(base)) {
      const input: Record<string, unknown> = { ...base };
      delete input[field];
      expect(parseScan(input)).toMatchObject({ status: "refused", code: "invalid-input" });
    }
    for (const input of [null, [], "scan", 1, { ...base, maxEvaluation: 1 },
      { ...base, convention: { ...base.convention, motion: "direct" } },
      { ...base, selections: [{ ...base.selections[0], ignored: true }] },
      { ...base, ageRange: { ...base.ageRange, includeTo: undefined } },
      { ...base, motions: [{ motion: "direct", converseConstruction: undefined }] },
      { ...base, motions: [{ motion: "converse" }] },
      { ...base, motions: [{ motion: "converse", converseConstruction: "negative-arc" }] },
      { ...base, motions: [{ motion: "unknown" }] }]) {
      expect(parseScan(input)).toMatchObject({ status: "refused", code: "invalid-input" });
    }
    for (const key of ["fromYears", "toYears", "includeFrom", "includeTo"]) {
      const range: Record<string, unknown> = { ...base.ageRange };
      delete range[key];
      expect(parseScan({ ...base, ageRange: range })).toMatchObject({ code: "invalid-input" });
    }
  });

  it("refuses invalid ages, budgets and empty lists", () => {
    for (const value of [-1, NaN, Infinity, -Infinity, "0", null]) {
      for (const key of ["fromYears", "toYears"]) {
        expect(parseScan({ ...base, ageRange: { ...base.ageRange, [key]: value } })).toMatchObject({ code: "invalid-input" });
      }
    }
    expect(parseScan({ ...base, ageRange: { ...base.ageRange, fromYears: 2, toYears: 1 } })).toMatchObject({ code: "invalid-input" });
    for (const value of [0, -1, 1.5, NaN, Infinity, "100", null, 10001]) {
      expect(parseScan({ ...base, maxEvaluations: value })).toMatchObject({ code: "invalid-input" });
    }
    for (const key of ["selections", "motions"]) {
      for (const value of [[], null, {}, new Set(), { length: 1 }]) {
        expect(parseScan({ ...base, [key]: value })).toMatchObject({ code: "invalid-input" });
      }
    }
  });

  it("retains hit validation for coordinates, conventions, contacts and timing", () => {
    for (const input of [
      { ...base, convention: { ...base.convention, latitude: "zero-both" } },
      { ...base, geometry: { ...base.geometry, latitudeDegrees: NaN } },
      { ...base, selections: [{ ...base.selections[0], contact: { kind: "aspect", aspect: "square", branch: "dexter" } }] },
      { ...base, yearUnit: "calendar-year" },
      { ...base, solar: undefined },
      { ...base, convention: { ...base.convention, key: "solar-equatorial-birth-day" } }
    ]) {
      expect(parseScan(input)).toMatchObject({ code: "hit-refused", hits: [], at: { selectionIndex: 0, motionIndex: 0 },
        work: { evaluated: 1 }, cause: { status: "refused" } });
    }
  });

  it("rejects accessor, hidden, inherited, symbol and malformed array slots without running code", () => {
    const getter = vi.fn(() => { throw new Error("must not run"); });
    const accessor = Object.defineProperty({ ...base }, "selections", { get: getter });
    const hidden = Object.defineProperty({ ...base }, "selections", { enumerable: false });
    const inherited = Object.create(base) as unknown;
    const symbol = { ...base, [Symbol("extra")]: true };
    for (const input of [accessor, hidden, inherited, symbol]) {
      expect(parseScan(input)).toMatchObject({ code: "invalid-input" });
    }
    for (const field of ["motions", "selections"] as const) {
      const valid = field === "motions" ? base.motions[0] : base.selections[0];
      const arrays: unknown[] = [new Array(1), Object.assign([valid], { extra: 1 }),
        Object.assign([valid], { [Symbol.iterator]: getter }),
        Object.defineProperty([valid], "0", { get: getter }),
        Object.defineProperty([valid], "0", { enumerable: false }),
        Object.setPrototypeOf([valid], null)];
      for (const array of arrays) expect(parseScan({ ...base, [field]: array })).toMatchObject({ code: "invalid-input" });
    }
    const badSelection = Object.defineProperty({ ...base.selections[0] }, "contact", { get: getter });
    expect(parseScan({ ...base, selections: [badSelection] })).toMatchObject({ code: "invalid-input" });
    const badPoint = Object.defineProperty({ ...base.selections[0].promissor }, "coordinates", { get: getter });
    expect(parseScan({ ...base, selections: [{ ...base.selections[0], promissor: badPoint }] }))
      .toMatchObject({ code: "hit-refused", cause: { code: "invalid-input" } });
    expect(getter).not.toHaveBeenCalled();
  });

  it("detaches every result without freezing or changing caller data", () => {
    const input = structuredClone({ ...base, convention: { ...base.convention, key: "solar-equatorial-birth-day" }, solar: SCAN_SOLAR_SAMPLES });
    const original = structuredClone(input);
    const result = complete(parseScan(input));
    const encoded = JSON.stringify(result);
    expect(input).toEqual(original);
    expect(Object.isFrozen(input)).toBe(false);
    Object.assign(input.selections[0].promissor.coordinates, { rightAscensionDegrees: 61 });
    Object.assign(input.solar.start, { rightAscensionDegrees: 10 });
    Object.assign(input.ageRange, { toYears: 500 });
    expect(JSON.stringify(result)).toBe(encoded);
    frozen(result);
    expect(complete(parseScan(Object.assign(Object.create(null) as object, base))).hits).toHaveLength(2);
  });
});
