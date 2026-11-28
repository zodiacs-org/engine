import type { ClassicalPlanet } from "../src/index.js";
import { translationFixture } from "./translation.fixture.js";
import type { Law } from "./translation.fixture.js";
export { DAY, epoch, instant } from "./translation.fixture.js";

/** Independent laws: collector 220+t/4; Mars 214+5t/4; Venus 285-t. */
export function collectionFixture(changes: Partial<Record<ClassicalPlanet, readonly [Law, number]>> = {}) {
  return translationFixture("Saturn", { Saturn: [t => 220 + t / 4, 0.25],
    Mars: [t => 214 + 1.25 * t, 1.25], Venus: [t => 285 - t, -1], ...changes });
}
