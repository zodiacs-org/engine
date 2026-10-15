import { calc } from "../../src/calc.js";
import type { CalcPosition, CalcRefusal, CalcTime } from "../../src/calc.js";

// Keep the engine's existing solver as the integration boundary. Mansion
// ingress searches will supply Moon longitudes to this function.
export { searchLongitudeCrossingsWith } from "../../src/crossings.js";

/** Internal tropical Moon sample, including the engine's unmodified receipt. */
export function tropicalMoon(time: CalcTime): CalcPosition | CalcRefusal {
  return calc({
    body: "Moon",
    time,
    frame: "ecliptic-true-of-date",
    center: "geocentric",
    zodiac: "tropical",
    flags: { correction: "apparent", speeds: false, units: "degrees" }
  });
}
