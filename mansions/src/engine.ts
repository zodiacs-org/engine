import { calc } from "../../src/calc.js";
import type { CalcAyanamsa, CalcPosition, CalcRefusal, CalcTime } from "../../src/calc.js";

// Keep the engine's existing solver as the integration boundary. Mansion
// ingress searches supply Moon longitudes to this function.
export { searchLongitudeCrossingsWith } from "../../src/crossings.js";

/** Internal tropical Moon sample, including the engine's unmodified receipt. */
export function tropicalMoon(time: CalcTime): CalcPosition | CalcRefusal {
  return moonIn(time, "tropical");
}

/** Internal sidereal sample; calc retains the ayanamsa and its bounds/receipt. */
export function siderealMoon(time: CalcTime, ayanamsa: CalcAyanamsa): CalcPosition | CalcRefusal {
  return moonIn(time, { sidereal: ayanamsa });
}

function moonIn(time: CalcTime, zodiac: "tropical" | { sidereal: CalcAyanamsa }): CalcPosition | CalcRefusal {
  return calc({
    body: "Moon",
    time,
    frame: "ecliptic-true-of-date",
    center: "geocentric",
    zodiac,
    flags: { correction: "apparent", speeds: false, units: "degrees" }
  });
}
