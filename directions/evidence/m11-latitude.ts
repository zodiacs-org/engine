import { semiArcs, SphereGeometryError } from "../src/sphere.js";

/*
 * Synthetic input families and an independent half-angle evaluation of the
 * horizon equation. See M11-latitude-derivations.md. The expectations below
 * never call the implementation. Only measureM11Latitude calls semiArcs.
 */

/** Acceptance thresholds set before comparing these families to the solver. */
export const M11_LATITUDE_ALLOWANCES = Object.freeze({
  angleDegrees: 1e-12,
  shortArcRelative: 64 * Number.EPSILON,
});

export const M11_LATITUDE_GAP_EXPONENTS = [0, 8, 16, 24, 32, 40, 46] as const;

interface ExpectedArcs {
  readonly ascensionalDifferenceDegrees: number;
  readonly diurnalSemiArcDegrees: number;
  readonly nocturnalSemiArcDegrees: number;
  readonly shortSemiArcDegrees: number;
}

export interface M11LatitudeCase {
  readonly id: string;
  readonly family: "equal-magnitudes" | "unequal-magnitudes" | "geographic-near-pole"
    | "celestial-near-pole" | "zero-declination";
  readonly derivation: string;
  readonly input: { readonly latitudeDegrees: number; readonly declinationDegrees: number };
  /** Exact positive gap from |latitude| + |declination| = 90 degrees. */
  readonly gapDegrees: number;
  readonly expected: ExpectedArcs;
}

export interface M11LatitudeRefusal {
  readonly id: string;
  readonly input: { readonly latitudeDegrees: number; readonly declinationDegrees: number };
  readonly expectedCode: "horizon-tangency" | "circumpolar-above" | "circumpolar-below"
    | "geographic-pole" | "celestial-pole";
}

/**
 * Independent identity: tan(S/2)^2 = sin(g) / sin(2t + g), with
 * t = min(|phi|, |delta|), g = 90 - |phi| - |delta|, and S the short arc.
 * The constructed gap is supplied directly so an input sum cannot erase it.
 */
function expectedArcs(latitudeDegrees: number, declinationDegrees: number, gapDegrees: number): ExpectedArcs {
  if (latitudeDegrees === 0 || declinationDegrees === 0) {
    return Object.freeze({
      ascensionalDifferenceDegrees: 0, diurnalSemiArcDegrees: 90,
      nocturnalSemiArcDegrees: 90, shortSemiArcDegrees: 90,
    });
  }
  const radians = Math.PI / 180;
  const t = Math.min(Math.abs(latitudeDegrees), Math.abs(declinationDegrees));
  // Equal magnitudes make 2t + g exactly 90 degrees; use sin(90) = 1.
  const denominator = Math.abs(latitudeDegrees) === Math.abs(declinationDegrees)
    ? 1 : Math.sin((2 * t + gapDegrees) * radians);
  const short = 2 * Math.atan(Math.sqrt(Math.sin(gapDegrees * radians) / denominator)) / radians;
  const sameHemisphere = Math.sign(latitudeDegrees) === Math.sign(declinationDegrees);
  return Object.freeze({
    ascensionalDifferenceDegrees: sameHemisphere ? 90 - short : short - 90,
    diurnalSemiArcDegrees: sameHemisphere ? 180 - short : short,
    nocturnalSemiArcDegrees: sameHemisphere ? short : 180 - short,
    shortSemiArcDegrees: short,
  });
}

function cases(): readonly M11LatitudeCase[] {
  const rows: M11LatitudeCase[] = [];
  function add(id: string, family: M11LatitudeCase["family"], phi: number, delta: number, gap: number): void {
    rows.push(Object.freeze({
      id, family, derivation: "M11-latitude-derivations.md#independent-half-angle-reference",
      input: Object.freeze({ latitudeDegrees: phi, declinationDegrees: delta }),
      gapDegrees: gap, expected: expectedArcs(phi, delta, gap),
    }));
  }
  for (const latitudeSign of [-1, 1]) {
    for (const declinationSign of [-1, 1]) {
      const signs = `${latitudeSign > 0 ? "north" : "south"}-${declinationSign > 0 ? "north" : "south"}`;
      for (const exponent of M11_LATITUDE_GAP_EXPONENTS) {
        const gap = 2 ** -exponent;
        add(`equal-${signs}-gap-2^-_${exponent}`, "equal-magnitudes",
          latitudeSign * (45 - gap / 2), declinationSign * (45 - gap / 2), gap);
      }
      for (const exponent of [8, 24, 40, 48]) {
        const gap = 2 ** -exponent;
        add(`unequal-${signs}-gap-2^-_${exponent}`, "unequal-magnitudes",
          latitudeSign * 60, declinationSign * (30 - gap), gap);
      }
      for (const exponent of [0, 16, 32, 46]) {
        const poleGap = 2 ** -exponent;
        add(`geographic-${signs}-pole-gap-2^-_${exponent}`, "geographic-near-pole",
          latitudeSign * (90 - poleGap), declinationSign * poleGap / 2, poleGap / 2);
        add(`celestial-${signs}-pole-gap-2^-_${exponent}`, "celestial-near-pole",
          latitudeSign * poleGap / 2, declinationSign * (90 - poleGap), poleGap / 2);
      }
    }
    for (const latitude of [0, 15, 30, 45, 60, 75, 89, 90 - 2 ** -46]) {
      add(`zero-declination-${latitudeSign > 0 ? "north" : "south"}-${latitude}`,
        "zero-declination", latitudeSign * latitude, 0, 90 - latitude);
    }
  }
  return Object.freeze(rows);
}

function refusals(): readonly M11LatitudeRefusal[] {
  const rows: M11LatitudeRefusal[] = [];
  function add(id: string, phi: number, delta: number, expectedCode: M11LatitudeRefusal["expectedCode"]): void {
    rows.push(Object.freeze({ id,
      input: Object.freeze({ latitudeDegrees: phi, declinationDegrees: delta }), expectedCode }));
  }
  for (const latitudeSign of [-1, 1]) {
    for (const declinationSign of [-1, 1]) {
      const signs = `${latitudeSign > 0 ? "north" : "south"}-${declinationSign > 0 ? "north" : "south"}`;
      const outside = latitudeSign === declinationSign ? "circumpolar-above" : "circumpolar-below";
      add(`tangent-equal-${signs}`, latitudeSign * 45, declinationSign * 45, "horizon-tangency");
      add(`tangent-unequal-${signs}`, latitudeSign * 60, declinationSign * 30, "horizon-tangency");
      add(`outside-equal-${signs}`, latitudeSign * (45 + 2 ** -47),
        declinationSign * (45 + 2 ** -47), outside);
      add(`outside-unequal-${signs}`, latitudeSign * 60, declinationSign * (30 + 2 ** -48), outside);
      add(`tangent-geographic-near-pole-${signs}`, latitudeSign * (90 - 2 ** -46),
        declinationSign * 2 ** -46, "horizon-tangency");
      add(`tangent-celestial-near-pole-${signs}`, latitudeSign * 2 ** -46,
        declinationSign * (90 - 2 ** -46), "horizon-tangency");
      add(`outside-geographic-near-pole-${signs}`, latitudeSign * (90 - 2 ** -46),
        declinationSign * (2 ** -46 + 2 ** -98), outside);
      add(`outside-celestial-near-pole-${signs}`, latitudeSign * (2 ** -46 + 2 ** -98),
        declinationSign * (90 - 2 ** -46), outside);
    }
    add(`geographic-pole-${latitudeSign}`, latitudeSign * 90, 0, "geographic-pole");
    add(`celestial-pole-${latitudeSign}`, 0, latitudeSign * 90, "celestial-pole");
  }
  return Object.freeze(rows);
}

export const M11_LATITUDE_CASES = cases();
export const M11_LATITUDE_REFUSALS = refusals();

export interface M11LatitudeNumericMeasurement {
  readonly id: string;
  readonly group: "latitude";
  readonly quantity: keyof ExpectedArcs;
  readonly unit: "degrees";
  readonly expected: number;
  readonly actual: number;
  readonly residual: number;
  readonly allowance: number;
  readonly passed: boolean;
}

export interface M11LatitudeRefusalMeasurement {
  readonly id: string;
  readonly group: "latitude";
  readonly expectedCode: M11LatitudeRefusal["expectedCode"];
  readonly actualCode: string | null;
  readonly passed: boolean;
}

export function measureM11Latitude(): {
  numeric: M11LatitudeNumericMeasurement[];
  refusals: M11LatitudeRefusalMeasurement[];
} {
  const numeric: M11LatitudeNumericMeasurement[] = [];
  for (const fixture of M11_LATITUDE_CASES) {
    const { latitudeDegrees, declinationDegrees } = fixture.input;
    const result = semiArcs(latitudeDegrees, declinationDegrees);
    const actual = { ...result,
      shortSemiArcDegrees: Math.min(result.diurnalSemiArcDegrees, result.nocturnalSemiArcDegrees) };
    for (const quantity of ["ascensionalDifferenceDegrees", "diurnalSemiArcDegrees",
      "nocturnalSemiArcDegrees", "shortSemiArcDegrees"] as const) {
      const expected = fixture.expected[quantity];
      const allowance = quantity === "shortSemiArcDegrees"
        ? M11_LATITUDE_ALLOWANCES.shortArcRelative * expected
        : M11_LATITUDE_ALLOWANCES.angleDegrees;
      const residual = actual[quantity] - expected;
      numeric.push({ id: `${fixture.id}/${quantity}`, group: "latitude", quantity, unit: "degrees",
        expected, actual: actual[quantity], residual, allowance,
        passed: Number.isFinite(actual[quantity]) && Math.abs(residual) <= allowance });
    }
  }
  const measuredRefusals = M11_LATITUDE_REFUSALS.map(fixture => {
    let actualCode: string | null = null;
    try { semiArcs(fixture.input.latitudeDegrees, fixture.input.declinationDegrees); }
    catch (error) {
      if (!(error instanceof SphereGeometryError)) throw error;
      actualCode = error.code;
    }
    return { id: fixture.id, group: "latitude" as const, expectedCode: fixture.expectedCode,
      actualCode, passed: actualCode === fixture.expectedCode };
  });
  return { numeric, refusals: measuredRefusals };
}
