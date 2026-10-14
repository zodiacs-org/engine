/**
 * The single source boundary to the parent engine. These are direct exports,
 * not copies or replacement models. Runtime tools must resolve the pinned
 * astronomy-engine dependency from fixedstars/node_modules.
 */
export { natalChart, chartDeclinations } from "../../src/api.js";
export { eclipticToEquatorial, RA_POLE_TOLERANCE } from "../../src/declination.js";
export { dateFrom } from "../../src/date-input.js";
export { onChartClock, gastHours } from "../../src/ephemeris.js";
export { eclipticOfDate, eclipticFrame, meanEcliptic } from "../../src/frame.js";
export { equatorRows, eclipticRows, turn } from "../../src/equator.js";
export { apply, frameMatrix, fromSpherical, toSpherical, transpose } from "../../src/calc-frames.js";
export type { Mat3, Vec3 } from "../../src/calc-frames.js";
export { AstroTime } from "astronomy-engine";
export { tilt } from "../../src/nutation.js";
export { timeBasis } from "../../src/time-scale.js";
export type { TimeBasis, TimeScaleName } from "../../src/time-scale.js";
export { EPHEMERIS_SPAN } from "../../src/reference-span.js";
export { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
export {
  createNatalEnvelope,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "../../src/receipt.js";
export { skyEvents } from "../../src/sky/riseset.js";

export type { BirthInput, BodyName, Chart, DateInput } from "../../src/types.js";
export type { NatalEnvelope, NatalReceipt } from "../../src/receipt.js";
export type {
  Observer,
  SkyBody,
  SkyEvent,
  SkyEventKind,
  SkyEvents,
  SkyOptions
} from "../../src/sky/riseset.js";

