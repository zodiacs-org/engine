/* Authored exact arithmetic fixtures; see M11-timing-derivations.md. */
import { directedAge, TimingError } from "../src/timing.js";
import type {
  DirectedAgeInput, DirectionYearUnit, SolarEquatorialDay, TimingErrorCode
} from "../src/timing.js";

interface Fraction { readonly n: bigint; readonly d: bigint }
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const fraction = (n: bigint, d = 1n): Fraction => ({ n, d });
const multiply = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.n, a.d * b.d);
const divide = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d, a.d * b.n);
const dyadic = (exponent: number): Fraction => exponent < 0
  ? fraction(1n, 1n << BigInt(-exponent)) : fraction(1n << BigInt(exponent));

/**
 * Independent integer reference conversion, rounding a nonnegative rational
 * once to nearest binary64 with ties to even. No production helper is used.
 */
export function m11RationalToNumber(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("Expected a nonnegative rational.");
  if (numerator === 0n) return 0;
  let exponent = numerator.toString(2).length - denominator.toString(2).length;
  if (exponent >= 0
    ? numerator < (denominator << BigInt(exponent))
    : (numerator << BigInt(-exponent)) < denominator) exponent--;
  const shift = exponent < -1022 ? 1074 : 52 - exponent;
  const scaledNumerator = shift >= 0 ? numerator << BigInt(shift) : numerator;
  const scaledDenominator = shift >= 0 ? denominator : denominator << BigInt(-shift);
  let significand = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  if (2n * remainder > scaledDenominator
    || (2n * remainder === scaledDenominator && significand % 2n !== 0n)) significand++;
  return Number(significand) * (exponent < -1022 ? Number.MIN_VALUE : 2 ** (exponent - 52));
}

const value = (q: Fraction): number => m11RationalToNumber(q.n, q.d);
const rationalRecord = (q: Fraction): { numerator: string; denominator: string } => ({
  numerator: q.n.toString(), denominator: q.d.toString()
});

/** Acceptance allowance fixed before measuring this finite arithmetic set. */
export const M11_TIMING_RELATIVE_ALLOWANCE = 16 * Number.EPSILON;

const years: readonly { unit: DirectionYearUnit; days: Fraction }[] = [
  { unit: "tropical-365.2422-days", days: fraction(1826211n, 5000n) },
  { unit: "julian-365.25-days", days: fraction(1461n, 4n) }
];
const nearTurn = fraction((360n << 44n) - 1n, 1n << 44n);
const nearHalf = fraction((180n << 45n) - 1n, 1n << 45n);
const fixedArcs = [
  { id: "zero", arc: fraction(0n) },
  { id: "small", arc: dyadic(-20) },
  { id: "eighth", arc: fraction(1n, 8n) },
  { id: "one", arc: fraction(1n) },
  { id: "quadrant", arc: fraction(90n) },
  { id: "half-turn", arc: fraction(180n) },
  { id: "last-first-turn-double", arc: nearTurn }
] as const;

function samples(startRa: number, endRa: number, startTt = 2451545, endTt = 2451546): SolarEquatorialDay {
  return {
    timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
    start: { jdTt: startTt, rightAscensionDegrees: startRa },
    end: { jdTt: endTt, rightAscensionDegrees: endRa }
  };
}

const solarCases = [
  { id: "ordinary-half", start: 100, end: 100.5, turns: 0, rate: fraction(1n, 2n), arc: fraction(1n, 8n) },
  { id: "wrapped-half", start: 359.75, end: 0.25, turns: 1, rate: fraction(1n, 2n), arc: fraction(1n, 8n) },
  { id: "wrapped-end-zero", start: 359.5, end: 0, turns: 1, rate: fraction(1n, 2n), arc: fraction(1n, 8n) },
  { id: "wrapped-one-ulp", start: value(nearTurn), end: 0, turns: 1, rate: dyadic(-44), arc: dyadic(-40) },
  { id: "wrapped-two-ulps", start: value(nearTurn), end: 2 ** -44, turns: 1, rate: dyadic(-43), arc: dyadic(-40) },
  { id: "below-half-turn", start: 0, end: value(nearHalf), turns: 0, rate: nearHalf, arc: fraction(1n) },
  { id: "wrapped-below-half-turn", start: 270, end: 90 - 2 ** -45, turns: 1, rate: nearHalf, arc: fraction(1n) },
  { id: "tiny-normal-rate", start: 0, end: 2 ** -1020, turns: 0, rate: dyadic(-1020), arc: dyadic(-1010) },
  { id: "least-positive-rate", start: 0, end: Number.MIN_VALUE, turns: 0, rate: dyadic(-1074), arc: dyadic(-1074) },
  { id: "least-positive-age", start: 0, end: 1, turns: 0, rate: fraction(1n), arc: dyadic(-1074) },
  { id: "zero-arc", start: 270, end: 271, turns: 0, rate: fraction(1n), arc: fraction(0n) }
] as const;

interface TimingCase {
  readonly id: string;
  readonly request: DirectedAgeInput;
  readonly arc: Fraction;
  readonly rate: Fraction;
  readonly yearDays: Fraction;
  readonly turns?: number;
}

function numericCases(): TimingCase[] {
  const cases: TimingCase[] = [];
  for (const year of years) {
    for (const key of ["ptolemy", "naibod"] as const) for (const fixture of fixedArcs) {
      cases.push({
        id: `${key}-${fixture.id}-${year.unit}`,
        request: { key, yearUnit: year.unit, arcDegrees: value(fixture.arc) },
        arc: fixture.arc, rate: key === "ptolemy" ? fraction(1n) : fraction(354833n, 360000n),
        yearDays: year.days
      });
    }
    cases.push({
      id: `ptolemy-least-positive-age-${year.unit}`,
      request: { key: "ptolemy", yearUnit: year.unit, arcDegrees: Number.MIN_VALUE },
      arc: dyadic(-1074), rate: fraction(1n), yearDays: year.days
    });
    for (const fixture of solarCases) cases.push({
      id: `solar-${fixture.id}-${year.unit}`,
      request: {
        key: "solar-equatorial-birth-day", yearUnit: year.unit, arcDegrees: value(fixture.arc),
        solar: samples(fixture.start, fixture.end)
      },
      arc: fixture.arc, rate: fixture.rate, yearDays: year.days, turns: fixture.turns
    });
  }
  return cases;
}

interface RefusalCase {
  readonly id: string;
  readonly request: DirectedAgeInput;
  readonly expectedCode: TimingErrorCode;
  readonly reason: string;
}

function refusalCases(): RefusalCase[] {
  const cases: RefusalCase[] = [];
  for (const year of years) {
    const solarRequest = (arcDegrees: number, start: number, end: number,
      startTt = 2451545, endTt = 2451546): DirectedAgeInput => ({
      key: "solar-equatorial-birth-day", yearUnit: year.unit, arcDegrees,
      solar: samples(start, end, startTt, endTt)
    });
    for (const key of ["ptolemy", "naibod", "solar-equatorial-birth-day"] as const) {
      for (const [name, arcDegrees] of [
        ["negative-min", -Number.MIN_VALUE], ["full-turn", 360], ["above-full-turn", 360 + 2 ** -44],
        ["nan", NaN], ["positive-infinity", Infinity], ["negative-infinity", -Infinity]
      ] as const) cases.push({
        id: `${key}-arc-${name}-${year.unit}`,
        request: key === "solar-equatorial-birth-day" ? solarRequest(arcDegrees, 100, 101)
          : { key, yearUnit: year.unit, arcDegrees },
        expectedCode: "invalid-input", reason: "The first-turn arc must be finite and in [0, 360)."
      });
    }
    for (const [name, start, end] of [
      ["zero", 0, 0], ["equal-nonzero", 359, 359], ["half-turn", 0, 180],
      ["wrapped-half-turn", 270, 90], ["above-half-turn", 0, 180 + 2 ** -45],
      ["wrapped-above-half-turn", 270, 90 + 2 ** -44], ["backwards", 100, 99.5],
      ["backwards-over-seam", 0.25, 359.75]
    ] as const) for (const arcDegrees of [0, 1]) cases.push({
      id: `solar-increment-${name}-arc-${arcDegrees}-${year.unit}`,
      request: solarRequest(arcDegrees, start, end), expectedCode: "invalid-solar-motion",
      reason: "The represented forward RA increment must be strictly between zero and a half-turn, even for a zero arc."
    });
    for (const [name, ra] of [
      ["negative-min", -Number.MIN_VALUE], ["full-turn", 360], ["nan", NaN], ["infinity", Infinity]
    ] as const) for (const field of ["start", "end"] as const) cases.push({
      id: `solar-ra-${field}-${name}-${year.unit}`,
      request: solarRequest(1, field === "start" ? ra : 100, field === "end" ? ra : 101),
      expectedCode: "invalid-input", reason: "Each represented solar RA must be finite and in [0, 360)."
    });
    for (const [name, start, end] of [
      ["zero", 0, 0], ["two-days", 0, 2], ["below-one-hidden-residual", Number.MIN_VALUE, 1],
      ["above-one-hidden-residual", -Number.MIN_VALUE, 1]
    ] as const) cases.push({
      id: `solar-interval-${name}-${year.unit}`,
      request: solarRequest(1, 100, 101, start, end), expectedCode: "invalid-solar-interval",
      reason: "The exact difference between represented TT dates must equal one day."
    });
    for (const [name, arc, rate, reason] of [
      ["age-overflow", 1, Number.MIN_VALUE, "The exact age 2^1074 exceeds binary64's finite range."],
      ["day-overflow", 1, 2 ** -1020, "The age 2^1020 is finite but either declared year makes elapsed days exceed binary64's range."],
      ["age-underflow", Number.MIN_VALUE, 2, "The positive exact age 2^-1075 rounds to zero by ties to even."]
    ] as const) cases.push({
      id: `solar-${name}-${year.unit}`, request: solarRequest(arc, 0, rate),
      expectedCode: "numerical-degeneracy", reason
    });
  }
  return cases;
}

function jsonInput(input: unknown): JsonValue {
  if (typeof input === "number") {
    if (Object.is(input, -0)) return "-0";
    return Number.isFinite(input) ? input : Number.isNaN(input) ? "NaN" : input > 0 ? "+Infinity" : "-Infinity";
  }
  if (input === null || typeof input === "string" || typeof input === "boolean") return input;
  if (Array.isArray(input)) return input.map(jsonInput);
  if (typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, v]) => [key, jsonInput(v)]));
  throw new TypeError("Fixture contains a non-data field.");
}

export interface M11TimingNumericRow {
  readonly id: string;
  readonly group: "timing";
  readonly quantity: string;
  readonly unit: string;
  readonly request: JsonValue;
  readonly expectedRational: { readonly numerator: string; readonly denominator: string };
  readonly expected: number;
  readonly actual: number;
  readonly residual: number;
  readonly allowance: number;
  readonly passed: boolean;
}

export interface M11TimingRefusalRow {
  readonly id: string;
  readonly group: "timing";
  readonly request: JsonValue;
  readonly reason: string;
  readonly expectedCode: TimingErrorCode;
  readonly actualCode: string | null;
  readonly passed: boolean;
}

/** Fresh, JSON-serializable measurements for the report runner and Vitest. */
export function measureM11Timing(): { numeric: M11TimingNumericRow[]; refusals: M11TimingRefusalRow[] } {
  const numeric: M11TimingNumericRow[] = [];
  for (const fixture of numericCases()) {
    const result = directedAge(fixture.request);
    const age = divide(fixture.arc, fixture.rate);
    const record = (quantity: string, unit: string, actual: number, exact: Fraction, exactMatch = false): void => {
      const expected = value(exact);
      const allowance = expected === 0 || exactMatch ? 0
        : Math.max(Number.MIN_VALUE, Math.abs(expected) * M11_TIMING_RELATIVE_ALLOWANCE);
      const residual = actual - expected;
      numeric.push({
        id: `${fixture.id}:${quantity}`, group: "timing", quantity, unit, request: jsonInput(fixture.request),
        expectedRational: rationalRecord(exact), expected, actual, residual, allowance,
        passed: Number.isFinite(actual) && Math.abs(residual) <= allowance
          && (expected === 0 ? Object.is(actual, 0) : actual > 0)
      });
    };
    record("arcDegrees", "degrees", result.arcDegrees, fixture.arc, true);
    record("rateDegreesPerYear", "degrees/year", result.rateDegreesPerYear, fixture.rate);
    record("directedAgeYears", "years", result.directedAgeYears, age);
    record("daysPerYear", "days/year", result.daysPerYear, fixture.yearDays);
    record("elapsedDays", "days", result.elapsedDays, multiply(age, fixture.yearDays));
    if (fixture.turns !== undefined && result.audit.kind === "solar-birth-day") {
      record("wholeTurnsAdded", "turns", result.audit.wholeTurnsAdded, fraction(BigInt(fixture.turns)), true);
      record("intervalTtDays", "days", result.audit.intervalTtDays, fraction(1n), true);
    } else if (fixture.turns !== undefined) throw new TypeError("Solar fixture returned a fixed-key audit.");
  }
  const refusals = refusalCases().map(fixture => {
    let actualCode: string | null = null;
    try { directedAge(fixture.request); } catch (error) {
      actualCode = error instanceof TimingError ? error.code : error instanceof Error ? error.name : "non-error-throw";
    }
    return {
      id: fixture.id, group: "timing" as const, request: jsonInput(fixture.request), reason: fixture.reason,
      expectedCode: fixture.expectedCode, actualCode, passed: actualCode === fixture.expectedCode
    };
  });
  return { numeric, refusals };
}
