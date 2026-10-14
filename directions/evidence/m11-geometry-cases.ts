/** Independent synthetic constructions, derived in M11-geometry-derivations.md.
 * No runtime implementation imports. The chosen rotations are inputs to the
 * construction, never outputs of the solver under test.
 */
import type { AngleConjunctionInput } from "../src/angles.js";
import type { MundaneBodyInput, MundaneContact } from "../src/mundane.js";
import type { ZodiacalBodyInput, ZodiacalContact } from "../src/zodiacal.js";

export const M11_GEOMETRY_ALLOWANCE_DEGREES = 1e-10;
export const M11_LATITUDES = [-60, -30, 30, 60] as const;
const turn = (angle: number): number => ((angle % 360) + 360) % 360;
const signed = (angle: number): number => turn(angle + 180) - 180;

// Literal temporal-hour table, at q=0,15,...,345 degrees. A quadrant is
// divided into six equal times; its actual rotation is D or 180-D.
const HOURS = {
  60: [0, 10, 20, 30, 40, 50, 60, 80, 100, 120, 140, 160,
    -180, -160, -140, -120, -100, -80, -60, -50, -40, -30, -20, -10],
  90: [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
    -180, -165, -150, -135, -120, -105, -90, -75, -60, -45, -30, -15],
  120: [0, 20, 40, 60, 80, 100, 120, 130, 140, 150, 160, 170,
    -180, -170, -160, -150, -140, -130, -120, -100, -80, -60, -40, -20]
} as const;
type Diurnal = keyof typeof HOURS;
function h(diurnal: Diurnal, q: number): number {
  const hour = HOURS[diurnal][q / 15];
  if (hour === undefined) throw new Error("Authored q must be a multiple of 15.");
  return hour;
}
function declination(phi: number, diurnal: Diurnal): number {
  // tan(phi)*tan(delta)=+/-1/2 gives AD=+/-30, by sin(30)=1/2.
  return diurnal === 90 ? 0
    : Math.atan((diurnal === 120 ? 0.5 : -0.5) / Math.tan(phi * Math.PI / 180)) * 180 / Math.PI;
}
const CONTACTS: readonly { id: string; offset: number; mundane: MundaneContact; zodiacal: ZodiacalContact }[] = [
  { id: "conjunction", offset: 0, mundane: { kind: "conjunction" }, zodiacal: { kind: "conjunction" } },
  { id: "opposition", offset: 180, mundane: { kind: "aspect", aspect: "opposition" }, zodiacal: { kind: "aspect", aspect: "opposition" } },
  ...(["sextile", "square", "trine"] as const).flatMap((aspect, i) => [
    { id: `${aspect}-positive`, offset: [60, 90, 120][i]!,
      mundane: { kind: "aspect" as const, aspect, branch: "westward" as const },
      zodiacal: { kind: "aspect" as const, aspect, branch: "sinister" as const } },
    { id: `${aspect}-negative`, offset: -[60, 90, 120][i]!,
      mundane: { kind: "aspect" as const, aspect, branch: "eastward" as const },
      zodiacal: { kind: "aspect" as const, aspect, branch: "dexter" as const } }
  ])
];

export interface M11MundaneCase {
  id: string;
  input: MundaneBodyInput;
  expected: { arc: number; fixedQ: number; targetQ: number; targetH: number;
    movingH: number; fixedD: number; movingD: number };
}
export const M11_MUNDANE_CASES: readonly M11MundaneCase[] = M11_LATITUDES.flatMap(phi => [
  { q: 15, d: 120 }, { q: 105, d: 60 }, { q: 195, d: 120 }, { q: 285, d: 60 },
  { q: 0, d: 90 }, { q: 90, d: 90 }, { q: 180, d: 90 }, { q: 270, d: 90 }
].flatMap(({ q, d }) => CONTACTS.flatMap(contact => (["direct", "converse"] as const).map(motion => {
  const fixedD = d as Diurnal;
  const movingD: Diurnal = fixedD === 120 || (fixedD === 90 && q < 180) ? 60 : 120;
  const targetQ = turn(q + (motion === "direct" ? -contact.offset : contact.offset));
  const targetH = h(movingD, targetQ);
  // Deliberately half-integer rotations keep moving inputs off every axis.
  const arc = q < 180 ? 7.5 : 277.5;
  const movingH = signed(targetH - arc);
  const ramc = phi > 0 ? 359 : 17;
  const fixed = { rightAscensionDegrees: turn(ramc - h(fixedD, q)), declinationDegrees: declination(phi, fixedD) };
  const moving = { rightAscensionDegrees: turn(ramc - movingH), declinationDegrees: declination(phi, movingD) };
  return {
    id: `mundane/phi${phi}/q${q}/${contact.id}/${motion}`,
    input: {
      system: "placidus-semiarc", mode: "mundane", latitude: "retain-both",
      ...(motion === "direct" ? { motion } : { motion, converseConstruction: "placidus-role-swap" }),
      geometry: { ramcDegrees: ramc, latitudeDegrees: phi }, contact: contact.mundane,
      significator: motion === "direct" ? fixed : moving,
      promissor: motion === "direct" ? moving : fixed
    },
    expected: { arc, fixedQ: q, targetQ, targetH, movingH, fixedD, movingD }
  };
}))));

export interface M11ZodiacalCase {
  id: string;
  input: ZodiacalBodyInput;
  expected: { arc: number; ray: number; rayRA?: number; targetH: number; movingH: number; movingD: number; declination: number };
}
const cardinalZodiacalCases: readonly M11ZodiacalCase[] = M11_LATITUDES.flatMap(phi =>
  ([90, 270] as const).flatMap(ray => [15, 105, 195, 285].flatMap(q => CONTACTS.map(contact => {
    const epsilon = Math.atan(0.5 / Math.tan(Math.abs(phi) * Math.PI / 180)) * 180 / Math.PI;
    const movingD: Diurnal = (phi > 0) === (ray === 90) ? 120 : 60;
    // S is an equinox with zero declination, hence qS=HS modulo a turn.
    const significatorLongitude = phi > 0 ? 0 : 180;
    const ramc = turn(significatorLongitude + q);
    const movingH = signed(ramc - ray);
    const targetH = h(movingD, q);
    return {
      id: `zodiacal/phi${phi}/ray${ray}/q${q}/${contact.id}`,
      input: {
        system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct",
        geometry: { ramcDegrees: ramc, latitudeDegrees: phi, trueObliquityDegrees: epsilon },
        significator: { longitudeDegrees: significatorLongitude, latitudeDegrees: 8 },
        promissor: { longitudeDegrees: turn(ray - contact.offset), latitudeDegrees: -11 },
        contact: contact.zodiacal
      },
      expected: { arc: turn(targetH - movingH), ray, targetH, movingH, movingD,
        declination: ray === 90 ? epsilon : -epsilon }
    };
  }))));

const noncardinalZodiacalCases: readonly M11ZodiacalCase[] = [-60, -30, 0, 30, 60].flatMap(phi =>
  [15, 30].flatMap(epsilon => [0, 180].flatMap(shift => [5, 95, 185, 275].flatMap(ramc =>
    CONTACTS.filter(contact => contact.id === "conjunction" || contact.id.startsWith("square")).map(contact => {
      // At lambda=45 and 135 the vectors share z and opposite x. Their RAs
      // are a and 180-a, where a=atan(cos(epsilon)); their declinations match.
      // Equal circles transfer H unchanged, hence arc=180-2a at every RAMC.
      const a = Math.atan(Math.cos(epsilon * Math.PI / 180)) * 180 / Math.PI;
      const delta = (shift === 0 ? 1 : -1)
        * Math.asin(Math.sin(epsilon * Math.PI / 180) / Math.sqrt(2)) * 180 / Math.PI;
      const diurnal = Math.acos(-Math.tan(phi * Math.PI / 180) * Math.tan(delta * Math.PI / 180)) * 180 / Math.PI;
      const ray = 135 + shift;
      return {
        id: `zodiacal-noncardinal/phi${phi}/eps${epsilon}/shift${shift}/ramc${ramc}/${contact.id}`,
        input: {
          system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct",
          geometry: { ramcDegrees: ramc, latitudeDegrees: phi, trueObliquityDegrees: epsilon },
          significator: { longitudeDegrees: 45 + shift, latitudeDegrees: 8 },
          promissor: { longitudeDegrees: turn(ray - contact.offset), latitudeDegrees: -11 }, contact: contact.zodiacal
        },
        expected: { arc: 180 - 2 * a, ray, rayRA: 180 - a + shift,
          targetH: signed(ramc - a - shift), movingH: signed(ramc - (180 - a + shift)),
          movingD: diurnal, declination: delta }
      };
    })))));
export const M11_ZODIACAL_CASES = [...cardinalZodiacalCases, ...noncardinalZodiacalCases];

export interface M11AngleCase {
  id: string;
  input: AngleConjunctionInput;
  expected: { arc: number; targetH: number; initialH: number; diurnal: number };
}
export const M11_ANGLE_CASES: readonly M11AngleCase[] = M11_LATITUDES.flatMap(phi =>
  ([60, 90, 120] as const).flatMap(diurnal => [-170, -20, 20, 170].flatMap(initialH =>
    (["mc", "ic", "asc", "dsc"] as const).map(angle => {
      const targetH = angle === "mc" ? 0 : angle === "ic" ? -180 : angle === "asc" ? -diurnal : diurnal;
      return {
        id: `angle/phi${phi}/d${diurnal}/h${initialH}/${angle}`,
        input: { motion: "direct", angle, coordinates: {
          ramcDegrees: 17, rightAscensionDegrees: turn(17 - initialH),
          latitudeDegrees: phi, declinationDegrees: declination(phi, diurnal)
        } },
        expected: { arc: turn(targetH - initialH), targetH, initialH, diurnal }
      };
    }))));
