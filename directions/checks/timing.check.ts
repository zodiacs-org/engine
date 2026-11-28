import { describe, expect, it } from "vitest";
import { directedAge, TimingError } from "../src/index.js";
import type { DirectedAgeInput, SolarEquatorialDay, TimingErrorCode } from "../src/index.js";
import {
  FIXED_TIMING_EXAMPLES, SOLAR_TIMING_EXAMPLES, YEAR_EXAMPLES,
  TIMING_FIXTURE_RELATIVE_TOLERANCE
} from "../evidence/timing-examples.js";
import type { Rational } from "../evidence/timing-examples.js";

const fixed = { arcDegrees: 12.5, key: "ptolemy", yearUnit: "tropical-365.2422-days" } as const;
const solarDay = {
  timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
  start: { jdTt: 2451545, rightAscensionDegrees: 100 },
  end: { jdTt: 2451546, rightAscensionDegrees: 100.5 }
} as const satisfies SolarEquatorialDay;
const solar = { ...fixed, key: "solar-equatorial-birth-day", solar: solarDay } as const;

function refused(input: unknown, code: TimingErrorCode = "invalid-input"): void {
  let caught: unknown;
  try { directedAge(input as DirectedAgeInput); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(TimingError);
  expect(caught).toMatchObject({ code });
}

function rational(value: Rational): number {
  return value.numerator / value.denominator;
}

// Multiply whole-number rational numerators/denominators independently with
// BigInt, before one conversion to binary64. No timing code is used here.
function rationalProduct(left: Rational, right: Rational): number {
  const numerator = BigInt(left.numerator) * BigInt(right.numerator);
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  return Number(numerator) / Number(denominator);
}

function close(actual: number, expected: number): void {
  if (expected === 0) {
    expect(Object.is(actual, 0)).toBe(true);
  } else {
    expect(Number.isFinite(actual)).toBe(true);
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * TIMING_FIXTURE_RELATIVE_TOLERANCE);
  }
}

function frozenData(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    expect("value" in descriptor).toBe(true);
    frozenData(descriptor.value);
  }
}

describe("timing keys against independent rational arithmetic", () => {
  for (const fixture of FIXED_TIMING_EXAMPLES) for (const year of YEAR_EXAMPLES) {
    it(`${fixture.id}, ${year.yearUnit}`, () => {
      const result = directedAge({ arcDegrees: rational(fixture.arc), key: fixture.key, yearUnit: year.yearUnit });
      expect(result).toMatchObject({ arcDegrees: rational(fixture.arc), key: fixture.key, yearUnit: year.yearUnit });
      close(result.rateDegreesPerYear, rational(fixture.rate));
      close(result.directedAgeYears, rational(fixture.age));
      close(result.daysPerYear, rational(year.daysPerYear));
      close(result.elapsedDays, rationalProduct(fixture.age, year.daysPerYear));
      expect(result.audit).toEqual({
        kind: "fixed", source: fixture.key === "ptolemy" ? "ptolemy-ashmand-iii14" : "kuehr-1936-naibod",
        rationalDegreesPerYear: fixture.rate
      });
    });
  }

  for (const fixture of SOLAR_TIMING_EXAMPLES) for (const year of YEAR_EXAMPLES) {
    it(`${fixture.id}, ${year.yearUnit}`, () => {
      const samples: SolarEquatorialDay = {
        ...solarDay,
        start: { ...solarDay.start, rightAscensionDegrees: fixture.startRa },
        end: { ...solarDay.end, rightAscensionDegrees: fixture.endRa }
      };
      const result = directedAge({ arcDegrees: rational(fixture.arc), key: solar.key, yearUnit: year.yearUnit, solar: samples });
      expect(result).toMatchObject({ arcDegrees: rational(fixture.arc), key: solar.key, yearUnit: year.yearUnit });
      close(result.rateDegreesPerYear, rational(fixture.rate));
      close(result.directedAgeYears, rational(fixture.age));
      close(result.daysPerYear, rational(year.daysPerYear));
      close(result.elapsedDays, rationalProduct(fixture.age, year.daysPerYear));
      expect(result.audit).toEqual({
        kind: "solar-birth-day", source: "lilly-1647-keys", samples,
        intervalTtDays: 1, wholeTurnsAdded: fixture.wholeTurnsAdded, advanceDegrees: rational(fixture.rate)
      });
    });
  }

  it("changes only the day unit when a year choice changes", () => {
    for (const input of [fixed, { ...fixed, key: "naibod" } as const, solar]) {
      const tropical = directedAge({ ...input, yearUnit: "tropical-365.2422-days" });
      const julian = directedAge({ ...input, yearUnit: "julian-365.25-days" });
      expect(julian.directedAgeYears).toBe(tropical.directedAgeYears);
      expect(julian.arcDegrees).toBe(tropical.arcDegrees);
      expect(julian.rateDegreesPerYear).toBe(tropical.rateDegreesPerYear);
      expect(julian.audit).toEqual(tropical.audit);
      expect(julian.elapsedDays).toBeGreaterThan(tropical.elapsedDays);
    }
  });
});

describe("timing strict data and explicit choices", () => {
  it("requires precisely the data fields appropriate to the chosen key", () => {
    const records = [
      { value: fixed, replace: (value: unknown) => value },
      { value: solar, replace: (value: unknown) => value },
      { value: solarDay, replace: (value: unknown) => ({ ...solar, solar: value }) },
      { value: solarDay.start, replace: (value: unknown) => ({ ...solar, solar: { ...solarDay, start: value } }) },
      { value: solarDay.end, replace: (value: unknown) => ({ ...solar, solar: { ...solarDay, end: value } }) }
    ];
    for (const { value, replace } of records) {
      for (const field of Object.keys(value)) {
        const missing: Record<string, unknown> = { ...value };
        delete missing[field];
        refused(replace(missing));
      }
      for (const malformed of [
        { ...value, unknown: true }, { ...value, [Symbol("extra")]: true },
        Object.defineProperty({ ...value }, "hidden", { value: 1 }),
        undefined, null, false, 42, "data", [], () => value,
        Object.create(value), Object.assign(Object.create({ inherited: true }), value)
      ]) refused(replace(malformed));
    }
    for (const key of ["ptolemy", "naibod"]) {
      refused({ ...fixed, key, solar: solarDay });
      refused({ ...fixed, key, solar: undefined });
    }
  });

  it("rejects every accessor depth without invoking a getter", () => {
    let reads = 0;
    const records = [
      { value: fixed, replace: (value: unknown) => value },
      { value: solar, replace: (value: unknown) => value },
      { value: solarDay, replace: (value: unknown) => ({ ...solar, solar: value }) },
      { value: solarDay.start, replace: (value: unknown) => ({ ...solar, solar: { ...solarDay, start: value } }) },
      { value: solarDay.end, replace: (value: unknown) => ({ ...solar, solar: { ...solarDay, end: value } }) }
    ];
    for (const { value, replace } of records) for (const field of Object.keys(value)) {
      refused(replace(Object.defineProperty({ ...value }, field, {
        get() { reads++; return "unused"; }, enumerable: true
      })));
      refused(replace(Object.defineProperty({ ...value }, field, { enumerable: false })));
    }
    expect(reads).toBe(0);
  });

  it("never supplies omitted, unsupported or contradictory conventions", () => {
    for (const key of [undefined, null, "Ptolemy", "solar-arc", "birthday", 0, false]) refused({ ...fixed, key });
    for (const yearUnit of [undefined, null, "tropical", "julian", "calendar-year", 365.25, false]) {
      refused({ ...fixed, yearUnit });
      refused({ ...solar, yearUnit });
    }
    for (const [field, values] of Object.entries({
      timeScale: [undefined, null, "utc", "ut1", false],
      frame: [undefined, null, "mean-equator-equinox-of-date", "ecliptic", false],
      center: [undefined, null, "topocentric", "heliocentric", false],
      correction: [undefined, null, "geometric", "astrometric", false]
    })) for (const value of values) refused({ ...solar, solar: { ...solarDay, [field]: value } });
    for (const field of ["motion", "mode", "longitudeDegrees", "directedAgeYears", "rateDegreesPerYear"]) {
      refused({ ...fixed, [field]: "unused" });
    }
  });

  it("requires a finite first-turn arc and canonical finite solar samples", () => {
    for (const arcDegrees of [undefined, null, "12.5", false, NaN, Infinity, -Infinity, -Number.MIN_VALUE, 360, 720]) {
      refused({ ...fixed, arcDegrees });
      refused({ ...solar, arcDegrees });
    }
    for (const sample of ["start", "end"] as const) {
      for (const field of ["jdTt", "rightAscensionDegrees"] as const) {
        for (const value of [undefined, null, "0", false, NaN, Infinity, -Infinity]) {
          refused({ ...solar, solar: { ...solarDay, [sample]: { ...solarDay[sample], [field]: value } } });
        }
      }
      for (const rightAscensionDegrees of [-Number.MIN_VALUE, 360, 720]) {
        refused({ ...solar, solar: { ...solarDay, [sample]: { ...solarDay[sample], rightAscensionDegrees } } });
      }
    }
  });

  it("accepts frozen and null-prototype data records without requiring a class instance", () => {
    const nullData = (value: object): Record<string, unknown> => Object.assign(Object.create(null), value);
    const input = nullData({ ...solar, solar: nullData({
      ...solarDay, start: nullData(solarDay.start), end: nullData(solarDay.end)
    }) });
    expect(directedAge(input as unknown as DirectedAgeInput)).toEqual(directedAge(solar));
    const freeze = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    };
    freeze(input);
    expect(directedAge(input as unknown as DirectedAgeInput)).toEqual(directedAge(solar));
  });
});

describe("solar sample interval and motion refusals", () => {
  it("requires exactly one forward TT day, even when subtraction rounds to one", () => {
    for (const jdTt of [2451544, 2451545, 2451545.5, 2451546.000001, 2451547]) {
      refused({ ...solar, solar: { ...solarDay, end: { ...solarDay.end, jdTt } } }, "invalid-solar-interval");
    }
    // The exact differences are 1 +/- MIN_VALUE. Ordinary subtraction loses
    // either residual and returns 1.
    for (const jdTt of [-Number.MIN_VALUE, Number.MIN_VALUE]) {
      refused({ ...solar, solar: {
        ...solarDay, start: { ...solarDay.start, jdTt }, end: { ...solarDay.end, jdTt: 1 }
      } }, "invalid-solar-interval");
    }
    for (const startJd of [-0.5, 0, 2451545.25, 2 ** 40]) {
      const result = directedAge({ ...solar, solar: {
        ...solarDay, start: { ...solarDay.start, jdTt: startJd }, end: { ...solarDay.end, jdTt: startJd + 1 }
      } });
      expect(result.directedAgeYears).toBe(25);
    }
  });

  it("refuses zero, backwards, half-turn and ambiguous larger motion before converting an arc", () => {
    for (const arcDegrees of [0, 12.5]) {
      for (const [startRa, endRa] of [[100, 100], [100, 99.5], [0, 180], [300, 120], [0, 270], [0.25, 359.75], [Number.MIN_VALUE, 180]]) {
        refused({ ...solar, arcDegrees, solar: {
          ...solarDay, start: { ...solarDay.start, rightAscensionDegrees: startRa! },
          end: { ...solarDay.end, rightAscensionDegrees: endRa! }
        } }, "invalid-solar-motion");
      }
    }
  });

  it("accepts a forward seam ending at exact zero and preserves its turn metadata", () => {
    const result = directedAge({ ...solar, solar: {
      ...solarDay, start: { ...solarDay.start, rightAscensionDegrees: 359.5 },
      end: { ...solarDay.end, rightAscensionDegrees: 0 }
    } });
    expect(result.directedAgeYears).toBe(25);
    expect(result.audit).toMatchObject({ wholeTurnsAdded: 1, advanceDegrees: 0.5 });
  });
});

describe("timing numerical and snapshot boundaries", () => {
  it("normalizes zero and preserves representable positive subnormal ages", () => {
    for (const input of [fixed, { ...fixed, key: "naibod" } as const, solar]) {
      const result = directedAge({ ...input, arcDegrees: -0 });
      expect(Object.is(result.arcDegrees, 0)).toBe(true);
      expect(Object.is(result.directedAgeYears, 0)).toBe(true);
      expect(Object.is(result.elapsedDays, 0)).toBe(true);
    }
    expect(directedAge({ ...fixed, arcDegrees: Number.MIN_VALUE }).directedAgeYears).toBe(Number.MIN_VALUE);
    expect(directedAge({ ...solar, arcDegrees: Number.MIN_VALUE }).directedAgeYears).toBe(2 * Number.MIN_VALUE);
    for (const input of [fixed, solar]) {
      const result = directedAge({ ...input, arcDegrees: 360 - 2 ** -44 });
      expect(result.arcDegrees).toBeLessThan(360);
      expect(Number.isFinite(result.elapsedDays)).toBe(true);
    }
  });

  it("refuses overflowing ages, overflowing day counts, and nonzero ages lost to zero", () => {
    for (const [arcDegrees, rate] of [[1, Number.MIN_VALUE], [1, 1e-307], [Number.MIN_VALUE, 2]]) {
      refused({ ...solar, arcDegrees, solar: {
        ...solarDay, start: { ...solarDay.start, rightAscensionDegrees: 0 },
        end: { ...solarDay.end, rightAscensionDegrees: rate! }
      } }, "numerical-degeneracy");
    }
    // The same tiny positive rate is valid when conversion has no overflow.
    const result = directedAge({ ...solar, arcDegrees: Number.MIN_VALUE, solar: {
      ...solarDay, start: { ...solarDay.start, rightAscensionDegrees: 0 },
      end: { ...solarDay.end, rightAscensionDegrees: Number.MIN_VALUE }
    } });
    expect(result.directedAgeYears).toBe(1);
    expect(result.elapsedDays).toBe(365.2422);
  });

  it("returns fresh deeply frozen data without retaining or freezing caller records", () => {
    for (const input of [
      { ...fixed }, { ...fixed, key: "naibod" } as const,
      { ...solar, solar: { ...solarDay, start: { ...solarDay.start }, end: { ...solarDay.end } } }
    ]) {
      const before = JSON.stringify(input);
      const result = directedAge(input);
      const encoded = JSON.stringify(result);
      const again = directedAge(input);
      frozenData(result);
      expect(JSON.stringify(input)).toBe(before);
      expect(Object.isFrozen(input)).toBe(false);
      expect(again).toEqual(result);
      expect(again).not.toBe(result);
      expect(again.audit).not.toBe(result.audit);
      expect(() => Object.assign(result, { directedAgeYears: 0 })).toThrow(TypeError);
      if (result.audit.kind === "fixed" && again.audit.kind === "fixed") {
        const audit = result.audit;
        expect(again.audit.rationalDegreesPerYear).not.toBe(audit.rationalDegreesPerYear);
        expect(() => Object.assign(audit.rationalDegreesPerYear, { numerator: 0 })).toThrow(TypeError);
      }
      if ("solar" in input && input.solar && result.audit.kind === "solar-birth-day" && again.audit.kind === "solar-birth-day") {
        for (const object of [input.solar, input.solar.start, input.solar.end]) expect(Object.isFrozen(object)).toBe(false);
        expect(result.audit.samples).not.toBe(input.solar);
        expect(again.audit.samples).not.toBe(result.audit.samples);
        expect(result.audit.samples.start).not.toBe(input.solar.start);
        expect(result.audit.samples.end).not.toBe(input.solar.end);
        expect(again.audit.samples.start).not.toBe(result.audit.samples.start);
        expect(again.audit.samples.end).not.toBe(result.audit.samples.end);
        Object.assign(input.solar.start, { rightAscensionDegrees: 40 });
        Object.assign(input.solar.end, { jdTt: 0 });
        Object.assign(input.solar, { timeScale: "utc" });
        const audit = result.audit;
        expect(() => Object.assign(audit.samples.start, { jdTt: 0 })).toThrow(TypeError);
      }
      Object.assign(input, { arcDegrees: 0 });
      expect(JSON.stringify(result)).toBe(encoded);
    }
  });
});
