import type { AspectLongitudeAt, AspectSpeedAt, ClassicalPlanet } from "../src/index.js";
import { aspectFixture, questionInput } from "./fixtures.js";
export const epoch = Date.parse(questionInput.instant), DAY = 86_400_000;
export const instant = (t: number) => new Date(epoch + t * DAY).toISOString();
export const wrap = (value: number) => ((value % 360) + 360) % 360;
type Law = (t: number) => number;
export type MotionLaw = readonly [longitude: Law, speed: Law];
/** Invented geometry and consistent independent derivatives, not an ephemeris chart. */
export function impedimentFixture(changes: Partial<Record<ClassicalPlanet, MotionLaw>> = {}) {
  const laws: Record<ClassicalPlanet, MotionLaw> = {
    Sun: [() => 100, () => 0], Moon: [() => 180, () => 0], Mercury: [() => 140, () => 0],
    Venus: [t => 10 + 2 * t, () => 2], Mars: [t => 16 + t, () => 1],
    Jupiter: [() => 220, () => 0], Saturn: [() => 260, () => 0], ...changes
  };
  const fixture = aspectFixture();
  for (const row of fixture.chart.bodies) {
    const law = laws[row.body as ClassicalPlanet]!;
    Object.assign(row, { lon: wrap(law[0](0)), speed: law[1](0) });
  }
  const longitudeAt: AspectLongitudeAt = (body, at) => wrap(laws[body][0]((at.getTime() - epoch) / DAY));
  const speedAt: AspectSpeedAt = (body, at) => laws[body][1]((at.getTime() - epoch) / DAY);
  return { fixture, longitudeAt, speedAt };
}
