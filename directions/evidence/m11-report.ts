import { measureM11Geometry } from "./m11-geometry.js";
import { M11_ANGLE_CASES, M11_MUNDANE_CASES, M11_ZODIACAL_CASES } from "./m11-geometry-cases.js";
import { measureM11Latitude, M11_LATITUDE_CASES, M11_LATITUDE_REFUSALS } from "./m11-latitude.js";
import { measureM11Timing } from "./m11-timing.js";

/** No engine chart is calculated here; all references are analytic/arithmetic. */
export function measureM11() {
  const geometry = measureM11Geometry();
  const latitude = measureM11Latitude();
  const timing = measureM11Timing();
  return {
    numeric: [...geometry.numeric, ...latitude.numeric, ...timing.numeric],
    refusals: [...latitude.refusals, ...timing.refusals],
    inputs: {
      angle: M11_ANGLE_CASES, mundane: M11_MUNDANE_CASES, zodiacal: M11_ZODIACAL_CASES,
      latitude: M11_LATITUDE_CASES, latitudeRefusals: M11_LATITUDE_REFUSALS
    }
  };
}
