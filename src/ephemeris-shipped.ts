/**
 * What the root's default source is and how it opens the shipped DE440 pack:
 * `src/ephemeris.ts` reads both from here, so that the core build
 * (`scripts/build-core.mjs`) can put `src/core/ephemeris-shipped.ts` in this
 * module's place and leave the pack out of `@zodiacs/engine/core`. The
 * package's own build (tsup) uses this file, so the root and every other
 * entry are as before.
 */
import type { DefaultEphemerisName } from "./ephemeris.js";

export { shippedDe440Source } from "./de440-pack.js";

/** The root's default source: the shipped DE440 pack. */
export const INITIAL_DEFAULT_EPHEMERIS: DefaultEphemerisName = "de440";
