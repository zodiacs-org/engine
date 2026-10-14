/** Internal M7 proof interface, compiled in memory by build-sky-adapter.mjs. */
import { skyEvents } from "./engine.js";
import type { DateInput, Observer, SkyEvents, SkyOptions } from "./engine.js";
import { withStarVector } from "./sky-vector.js";
import type { CatalogStar } from "./types.js";

export { skyEvents as bodyEvents } from "./engine.js";

/**
 * Raw native solver output. The private Pluto slot is still labelled Pluto;
 * M8 must wrap this with the star id and explicit fixedstars call provenance.
 */
export function starEvents(
  star: CatalogStar, observer: Observer, from: DateInput, to: DateInput, options?: SkyOptions
): SkyEvents {
  return withStarVector(star, () => skyEvents("Pluto", observer, from, to, options));
}
