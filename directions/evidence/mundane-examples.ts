/**
 * Authored synthetic examples, proved in M6-derivations.md.
 * No implementation import or earlier package output supplies an expectation.
 * Every angle is in degrees; the branch is always original promissor to
 * original significator in the westward proportional coordinate.
 */
export const MUNDANE_FIXTURE_TOLERANCE_DEGREES = 1e-10;

type Contact = { readonly kind: "conjunction" }
  | { readonly kind: "aspect"; readonly aspect: "opposition" }
  | { readonly kind: "aspect"; readonly aspect: "sextile" | "square" | "trine";
    readonly branch: "westward" | "eastward" };
type Point = { readonly rightAscensionDegrees: number; readonly declinationDegrees: number };

export interface MundaneExample {
  readonly id: string;
  readonly derivation: string;
  readonly geometry: { readonly ramcDegrees: number; readonly latitudeDegrees: number };
  readonly significator: Point;
  readonly promissor: Point;
  readonly contact: Contact;
  readonly motion: "direct" | "converse";
  readonly expected: {
    readonly arcDegrees: number;
    readonly significatorHourAngleDegrees: number;
    readonly promissorHourAngleDegrees: number;
    readonly significatorPositionDegrees: number;
    readonly promissorPositionDegrees: number;
    readonly significatorDiurnalDegrees: number;
    readonly significatorNocturnalDegrees: number;
    readonly promissorDiurnalDegrees: number;
    readonly promissorNocturnalDegrees: number;
    readonly targetPositionDegrees: number;
    readonly targetHourAngleDegrees: number;
    readonly rayOffsetDegrees: number;
  };
}

// This is an input definition: tan(delta) = 1/2 gives AD = 30 at phi = 45.
const delta = Math.atan(1 / 2) * 180 / Math.PI;

const conjunction = { kind: "conjunction" } as const;
const opposition = { kind: "aspect", aspect: "opposition" } as const;
const sextileWest = { kind: "aspect", aspect: "sextile", branch: "westward" } as const;
const sextileEast = { kind: "aspect", aspect: "sextile", branch: "eastward" } as const;
const squareWest = { kind: "aspect", aspect: "square", branch: "westward" } as const;
const squareEast = { kind: "aspect", aspect: "square", branch: "eastward" } as const;
const trineWest = { kind: "aspect", aspect: "trine", branch: "westward" } as const;
const trineEast = { kind: "aspect", aspect: "trine", branch: "eastward" } as const;

// Columns are hand arithmetic, not evaluations of a coordinate inverse.
const aspectRows = [
  { id: "conjunction", contact: conjunction, offset: 0, directQ: 30, directH: 20, directArc: 50,
    converseQ: 315, converseH: -60, converseArc: 260 },
  { id: "sextile-westward", contact: sextileWest, offset: 60, directQ: 330, directH: -20, directArc: 10,
    converseQ: 15, converseH: 20, converseArc: 340 },
  { id: "sextile-eastward", contact: sextileEast, offset: -60, directQ: 90, directH: 60, directArc: 90,
    converseQ: 255, converseH: -130, converseArc: 190 },
  { id: "square-westward", contact: squareWest, offset: 90, directQ: 300, directH: -40, directArc: 350,
    converseQ: 45, converseH: 60, converseArc: 20 },
  { id: "square-eastward", contact: squareEast, offset: -90, directQ: 120, directH: 100, directArc: 130,
    converseQ: 225, converseH: -150, converseArc: 170 },
  { id: "trine-westward", contact: trineWest, offset: 120, directQ: 270, directH: -60, directArc: 330,
    converseQ: 75, converseH: 100, converseArc: 60 },
  { id: "trine-eastward", contact: trineEast, offset: -120, directQ: 150, directH: 140, directArc: 170,
    converseQ: 195, converseH: -170, converseArc: 150 },
  { id: "opposition", contact: opposition, offset: 180, directQ: 210, directH: -140, directArc: 250,
    converseQ: 135, converseH: 150, converseArc: 110 },
] as const;

const aspectExamples: MundaneExample[] = aspectRows.flatMap(row =>
  (["direct", "converse"] as const).map(motion => ({
    id: `opposite-semiarcs-${motion}-${row.id}`,
    derivation: "M6-derivations.md#unequal-semi-arc-aspect-matrix",
    geometry: { ramcDegrees: 0, latitudeDegrees: 45 },
    significator: { rightAscensionDegrees: 320, declinationDegrees: delta },
    promissor: { rightAscensionDegrees: 30, declinationDegrees: -delta },
    contact: row.contact, motion,
    expected: {
      arcDegrees: motion === "direct" ? row.directArc : row.converseArc,
      significatorHourAngleDegrees: 40, promissorHourAngleDegrees: -30,
      significatorPositionDegrees: 30, promissorPositionDegrees: 315,
      significatorDiurnalDegrees: 120, significatorNocturnalDegrees: 60,
      promissorDiurnalDegrees: 60, promissorNocturnalDegrees: 120,
      targetPositionDegrees: motion === "direct" ? row.directQ : row.converseQ,
      targetHourAngleDegrees: motion === "direct" ? row.directH : row.converseH,
      rayOffsetDegrees: row.offset,
    },
  })));

// S has D=120,N=60; P has D=N=90. Both occupy the named quadrant.
const quadrantRows = [
  { id: "above-west", sra: 320, pra: 300, hs: 40, hp: 60, qs: 30, qp: 60,
    directH: 30, directArc: 330, converseH: 80, converseArc: 40 },
  { id: "below-west", sra: 220, pra: 210, hs: 140, hp: 150, qs: 120, qp: 150,
    directH: 120, directArc: 330, converseH: 160, converseArc: 20 },
  { id: "below-east", sra: 160, pra: 120, hs: -160, hp: -120, qs: 210, qp: 240,
    directH: -150, directArc: 330, converseH: -140, converseArc: 20 },
  { id: "above-east", sra: 80, pra: 30, hs: -80, hp: -30, qs: 300, qp: 330,
    directH: -60, directArc: 330, converseH: -40, converseArc: 40 },
] as const;

const quadrantExamples: MundaneExample[] = quadrantRows.flatMap(row =>
  (["direct", "converse"] as const).flatMap(motion =>
    (["north", "south"] as const).map(hemisphere => ({
      id: `${hemisphere}-${motion}-conjunction-${row.id}`,
      derivation: "M6-derivations.md#quadrants-and-hemisphere-mirror",
      geometry: { ramcDegrees: 0, latitudeDegrees: hemisphere === "north" ? 45 : -45 },
      significator: { rightAscensionDegrees: row.sra, declinationDegrees: hemisphere === "north" ? delta : -delta },
      promissor: { rightAscensionDegrees: row.pra, declinationDegrees: 0 },
      contact: conjunction, motion,
      expected: {
        arcDegrees: motion === "direct" ? row.directArc : row.converseArc,
        significatorHourAngleDegrees: row.hs, promissorHourAngleDegrees: row.hp,
        significatorPositionDegrees: row.qs, promissorPositionDegrees: row.qp,
        significatorDiurnalDegrees: 120, significatorNocturnalDegrees: 60,
        promissorDiurnalDegrees: 90, promissorNocturnalDegrees: 90,
        targetPositionDegrees: motion === "direct" ? row.qs : row.qp,
        targetHourAngleDegrees: motion === "direct" ? row.directH : row.converseH,
        rayOffsetDegrees: 0,
      },
    }))));

// The fixed point is equatorial, so its axis is exact in binary64. The
// moving oblique point starts on the upper meridian in every row.
const axisRows = [
  { id: "upper-meridian", ra: 0, h: 0, q: 0, target: 0, arc: 0 },
  { id: "setting", ra: 270, h: 90, q: 90, target: 120, arc: 120 },
  { id: "lower-meridian", ra: 180, h: -180, q: 180, target: -180, arc: 180 },
  { id: "rising", ra: 90, h: -90, q: 270, target: -120, arc: 240 },
] as const;

const axisExamples: MundaneExample[] = axisRows.flatMap(row =>
  (["direct", "converse"] as const).map(motion => {
    const fixed = { rightAscensionDegrees: row.ra, declinationDegrees: 0 };
    const moving = { rightAscensionDegrees: 0, declinationDegrees: delta };
    return {
      id: `fixed-axis-${motion}-${row.id}`,
      derivation: "M6-derivations.md#fixed-axes",
      geometry: { ramcDegrees: 0, latitudeDegrees: 45 },
      significator: motion === "direct" ? fixed : moving,
      promissor: motion === "direct" ? moving : fixed,
      contact: conjunction, motion,
      expected: {
        arcDegrees: row.arc,
        significatorHourAngleDegrees: motion === "direct" ? row.h : 0,
        promissorHourAngleDegrees: motion === "direct" ? 0 : row.h,
        significatorPositionDegrees: motion === "direct" ? row.q : 0,
        promissorPositionDegrees: motion === "direct" ? 0 : row.q,
        significatorDiurnalDegrees: motion === "direct" ? 90 : 120,
        significatorNocturnalDegrees: motion === "direct" ? 90 : 60,
        promissorDiurnalDegrees: motion === "direct" ? 120 : 90,
        promissorNocturnalDegrees: motion === "direct" ? 60 : 90,
        targetPositionDegrees: row.q, targetHourAngleDegrees: row.target, rayOffsetDegrees: 0,
      },
    };
  }));

// Exact equatorial initial aspects avoid using an approximate oblique
// declination to demand coincidence at a modular seam.
const coincidentExamples: MundaneExample[] = ([
  { id: "westward", contact: squareWest, pra: 60, hp: -60, qp: 300, offset: 90 },
  { id: "eastward", contact: squareEast, pra: 240, hp: 120, qp: 120, offset: -90 },
] as const).flatMap(row => (["direct", "converse"] as const).map(motion => ({
  id: `equatorial-initial-square-${row.id}-${motion}`,
  derivation: "M6-derivations.md#exact-initial-aspects",
  geometry: { ramcDegrees: 0, latitudeDegrees: 0 },
  significator: { rightAscensionDegrees: 330, declinationDegrees: 0 },
  promissor: { rightAscensionDegrees: row.pra, declinationDegrees: 0 },
  contact: row.contact, motion,
  expected: {
    arcDegrees: 0, significatorHourAngleDegrees: 30, promissorHourAngleDegrees: row.hp,
    significatorPositionDegrees: 30, promissorPositionDegrees: row.qp,
    significatorDiurnalDegrees: 90, significatorNocturnalDegrees: 90,
    promissorDiurnalDegrees: 90, promissorNocturnalDegrees: 90,
    targetPositionDegrees: motion === "direct" ? row.qp : 30,
    targetHourAngleDegrees: motion === "direct" ? row.hp : 30,
    rayOffsetDegrees: row.offset,
  },
})));

export const MUNDANE_EXAMPLES: readonly MundaneExample[] = [
  ...aspectExamples, ...quadrantExamples, ...axisExamples, ...coincidentExamples,
];
