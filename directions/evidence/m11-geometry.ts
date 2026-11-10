import { angleConjunctionArc } from "../src/angles.js";
import { mundaneBodyArc } from "../src/mundane.js";
import { zodiacalBodyArc } from "../src/zodiacal.js";
import { M11_ANGLE_CASES, M11_MUNDANE_CASES, M11_ZODIACAL_CASES,
  M11_GEOMETRY_ALLOWANCE_DEGREES } from "./m11-geometry-cases.js";

/** Measurement only. Expectations live in the separate construction file. */
export function measureM11Geometry() {
  const numeric: { id: string; group: string; quantity: string; unit: string;
    expected: number; actual: number; residual: number; allowance: number; passed: boolean }[] = [];
  function add(id: string, group: string, quantity: string, actual: number, expected: number) {
    const residual = actual - expected;
    numeric.push({ id, group, quantity, unit: "degrees", expected, actual, residual,
      allowance: M11_GEOMETRY_ALLOWANCE_DEGREES,
      passed: Number.isFinite(actual) && Math.abs(residual) <= M11_GEOMETRY_ALLOWANCE_DEGREES });
  }
  for (const row of M11_MUNDANE_CASES) {
    const result = mundaneBodyArc(row.input);
    const g = result.geometry;
    const expected = row.expected;
    add(row.id, "mundane", "arc", result.arcDegrees, expected.arc);
    add(row.id, "mundane", "targetH", g.targetHourAngleDegrees, expected.targetH);
    add(row.id, "mundane", "targetQ", g.targetSemiArcPositionDegrees, expected.targetQ);
    add(row.id, "mundane", "fixedQ", g.fixedSemiArcPositionDegrees, expected.fixedQ);
    add(row.id, "mundane", "movingH", g[g.movingRole].hourAngleDegrees, expected.movingH);
    add(row.id, "mundane", "fixedD", g[g.fixedRole].semiArcs.diurnalSemiArcDegrees, expected.fixedD);
    add(row.id, "mundane", "movingD", g[g.movingRole].semiArcs.diurnalSemiArcDegrees, expected.movingD);
  }
  for (const row of M11_ZODIACAL_CASES) {
    const result = zodiacalBodyArc(row.input);
    const g = result.geometry;
    const expected = row.expected;
    add(row.id, "zodiacal", "arc", result.arcDegrees, expected.arc);
    add(row.id, "zodiacal", "targetH", g.targetHourAngleDegrees, expected.targetH);
    add(row.id, "zodiacal", "movingH", g.promissor.position.hourAngleDegrees, expected.movingH);
    add(row.id, "zodiacal", "movingD", g.promissor.position.semiArcs.diurnalSemiArcDegrees, expected.movingD);
    add(row.id, "zodiacal", "rayLongitude", g.promissor.longitudeDegrees, expected.ray);
    add(row.id, "zodiacal", "rayRA", g.promissor.rightAscensionDegrees, expected.rayRA ?? expected.ray);
    add(row.id, "zodiacal", "rayDeclination", g.promissor.declinationDegrees, expected.declination);
  }
  for (const row of M11_ANGLE_CASES) {
    const result = angleConjunctionArc(row.input);
    const g = result.geometry;
    const expected = row.expected;
    add(row.id, "angle", "arc", result.arcDegrees, expected.arc);
    add(row.id, "angle", "targetH", g.targetHourAngleDegrees, expected.targetH);
    add(row.id, "angle", "initialH", g.initial.hourAngleDegrees, expected.initialH);
    add(row.id, "angle", "diurnal", g.initial.semiArcs.diurnalSemiArcDegrees, expected.diurnal);
  }
  return { numeric, refusals: [] };
}
