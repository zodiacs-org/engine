import type { AspectLongitudeAt, ClassicalPlanet, HoraryCast } from "../src/index.js";
import { aspectFixture, questionInput } from "./fixtures.js";

export const epoch = Date.parse(questionInput.instant), DAY = 86_400_000;
export const instant = (t: number) => new Date(epoch + t * DAY).toISOString();
export const wrap = (value: number) => ((value % 360) + 360) % 360;
export type Law = (t: number) => number;
/** Independent linear laws: source 10+t, receiver 16+2t, carrier 12+3t. */
export function translationFixture(carrier: ClassicalPlanet = "Moon", changes: Partial<Record<ClassicalPlanet, readonly [Law, number]>> = {}) {
  const laws: Record<ClassicalPlanet, readonly [Law, number]> = {
    Sun: [() => 100, 0], Moon: [() => 140, 0], Mercury: [() => 180, 0],
    Venus: [t => 16 + 2 * t, 2], Mars: [t => 10 + t, 1], Jupiter: [() => 220, 0], Saturn: [() => 260, 0],
    [carrier]: [(t: number) => 12 + 3 * t, 3], ...changes
  };
  const fixture: HoraryCast = aspectFixture();
  for (const row of fixture.chart.bodies) {
    const law = laws[row.body as ClassicalPlanet]!;
    Object.assign(row, { lon: wrap(law[0](0)), speed: law[1] });
  }
  const longitudeAt: AspectLongitudeAt = (body, at) => wrap(laws[body][0]((at.getTime() - epoch) / DAY));
  return { fixture, longitudeAt };
}
