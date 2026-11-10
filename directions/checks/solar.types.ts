import { prepareSolarEquatorialDay, SolarPreparationError } from "../src/solar.js";
import type {
  PreparedSolarEquatorialDay, SolarEquatorialDayInput, SolarPreparationErrorCode
} from "../src/solar.js";
import type { SolarEquatorialDay } from "../src/timing.js";

const valid = {
  time: { jd: 2451545, scale: "ut1" }, dayScale: "tt"
} as const satisfies SolarEquatorialDayInput;
const pinned = {
  ...valid, time: { ...valid.time, deltaT: 64 }
} as const satisfies SolarEquatorialDayInput;
const { time: _time, ...noTime } = valid;
const { dayScale: _dayScale, ...noDayScale } = valid;
// @ts-expect-error The sampling instant is required.
const missingTime: SolarEquatorialDayInput = noTime;
// @ts-expect-error The sampling day cannot silently choose a clock.
const missingDayScale: SolarEquatorialDayInput = noDayScale;
// @ts-expect-error The input clock cannot silently default to UTC.
const missingInputScale: SolarEquatorialDayInput = { ...valid, time: { jd: 2451545 } };
// @ts-expect-error A named input clock also needs a Julian date.
const missingJulianDate: SolarEquatorialDayInput = { ...valid, time: { scale: "tt" } };
// @ts-expect-error ISO text does not supply an explicit input-scale choice.
const implicitUtcInput: SolarEquatorialDayInput = { ...valid, time: "2000-01-01T12:00:00Z" };
// @ts-expect-error Day sampling is explicitly on TT, not the original input scale.
const utcDay: SolarEquatorialDayInput = { ...valid, dayScale: "utc" };
// @ts-expect-error Day sampling is explicitly on TT, not UT1.
const ut1Day: SolarEquatorialDayInput = { ...valid, dayScale: "ut1" };
// @ts-expect-error TT is spelled as the public engine scale id.
const uppercaseScale: SolarEquatorialDayInput = { ...valid, time: { ...valid.time, scale: "TT" } };
// @ts-expect-error Julian dates must be numbers.
const stringJulianDate: SolarEquatorialDayInput = { ...valid, time: { ...valid.time, jd: "2451545" } };
// @ts-expect-error Omit an unused deltaT pin instead of explicitly supplying undefined.
const undefinedPin: SolarEquatorialDayInput = { ...valid, time: { ...valid.time, deltaT: undefined } };
// @ts-expect-error A supplied deltaT pin is numeric seconds.
const nullPin: SolarEquatorialDayInput = { ...valid, time: { ...valid.time, deltaT: null } };
// @ts-expect-error Solar sample generation does not select a timing key.
const extraKey: SolarEquatorialDayInput = { ...valid, key: "solar-equatorial-birth-day" };
// @ts-expect-error Errors have the adapter's closed code union.
const unknownError: SolarPreparationErrorCode = "unknown";

// Never executed: compilation checks the adapter and nested output contracts.
function readonlySamples(
  result: PreparedSolarEquatorialDay, input: SolarEquatorialDayInput, error: SolarPreparationError
): void {
  const generated: PreparedSolarEquatorialDay = prepareSolarEquatorialDay(valid);
  const generatedWithPin: PreparedSolarEquatorialDay = prepareSolarEquatorialDay(pinned);
  const pureSamples: SolarEquatorialDay = result.samples;
  const dayScale: "tt" = result.samples.timeScale;
  const code: SolarPreparationErrorCode = error.code;
  const allowedCodes: readonly SolarPreparationErrorCode[] = ["invalid-input", "engine-refusal", "invalid-engine-result"];
  // @ts-expect-error An input is required.
  prepareSolarEquatorialDay();
  // @ts-expect-error Input clocks are readonly.
  input.time.scale = "utc";
  // @ts-expect-error Input dates are readonly.
  input.time.jd = 0;
  // @ts-expect-error Sample timestamps are readonly.
  result.samples.start.jdTt = 0;
  // @ts-expect-error Sample coordinates are readonly.
  result.samples.end.rightAscensionDegrees = 0;
  // @ts-expect-error Audit metadata is readonly.
  result.provenance.start.declinationDegrees = 0;
  // @ts-expect-error Bounds nested inside provenance are readonly.
  result.provenance.end.bounds.position.value = 0;
  // @ts-expect-error Engine receipt instants are readonly.
  result.provenance.resolutionReceipt.instants[0]!.jdTt = 0;
  // @ts-expect-error Receipt time-basis fields are readonly.
  result.provenance.start.receipt.instants[0]!.deltaT.seconds = 0;
  // @ts-expect-error Receipt convention arrays are readonly.
  result.provenance.end.receipt.conventions.push("other");
  // @ts-expect-error The receipt's nested ephemeris metadata is readonly.
  result.provenance.start.receipt.engine.ephemeris.version = "other";
  // @ts-expect-error Error codes are readonly.
  error.code = "invalid-input";
  void [generated, generatedWithPin, pureSamples, dayScale, code, allowedCodes];
}
void [missingTime, missingDayScale, missingInputScale, missingJulianDate, implicitUtcInput,
  utcDay, ut1Day, uppercaseScale, stringJulianDate, undefinedPin, nullPin, extraKey,
  unknownError, readonlySamples];
