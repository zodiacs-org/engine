/**
 * The core entry's stand-in for `src/ephemeris-shipped.ts`
 * (`scripts/build-core.mjs` swaps it in): the default source is
 * astronomy-engine, and there is no shipped pack to open, so
 * `setDefaultEphemeris("de440")` in the core entry computes on
 * astronomy-engine and labels every result `"de440-unavailable"`, as the
 * root does when its pack cannot be opened. A caller who wants DE440 in the
 * core entry supplies a pack through `@zodiacs/engine/de440` and
 * `withEphemeris`.
 */
import type { De440Source } from "../de440.js";
import type { DefaultEphemerisName } from "../ephemeris.js";

/** The core entry's default source: astronomy-engine. */
export const INITIAL_DEFAULT_EPHEMERIS: DefaultEphemerisName = "astronomy-engine";

/** Always throws: `@zodiacs/engine/core` carries no DE440 pack. */
export function shippedDe440Source(): De440Source {
  throw new Error("@zodiacs/engine/core carries no DE440 pack; supply one through @zodiacs/engine/de440 and withEphemeris, or import @zodiacs/engine");
}
