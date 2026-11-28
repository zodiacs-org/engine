// Public source entry points only. The eval loader bundles this locally, without dist/.
export {
  ASPECTS, ASPECT_BODIES, ENGINE_VERSION, EPHEMERIS, REFERENCE_SPAN,
  STATIONARY_RELATIVE_SPEED, houseOf, natalChart
} from "../../src/index.js";
export { CLASSICAL_PLANETS, dignitiesFor } from "../../src/techniques.js";
export { NATAL_RECEIPT_CONVENTION_SETS } from "../../src/receipt.js";
