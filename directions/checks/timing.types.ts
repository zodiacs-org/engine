import { directedAge, TimingError } from "../src/index.js";
import type {
  DirectedAgeInput, DirectedAge, DirectionYearUnit, SolarEquatorialDay, TimingErrorCode
} from "../src/index.js";

const fixed = { arcDegrees: 12.5, key: "ptolemy", yearUnit: "tropical-365.2422-days" } as const satisfies DirectedAgeInput;
const samples = {
  timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
  start: { jdTt: 2451545, rightAscensionDegrees: 100 },
  end: { jdTt: 2451546, rightAscensionDegrees: 100.5 }
} as const satisfies SolarEquatorialDay;
const solar = { ...fixed, key: "solar-equatorial-birth-day", solar: samples } as const satisfies DirectedAgeInput;
const { arcDegrees: _arc, ...noArc } = fixed;
const { key: _key, ...noKey } = fixed;
const { yearUnit: _year, ...noYear } = fixed;
// @ts-expect-error A nonnegative arc must be supplied explicitly.
const missingArc: DirectedAgeInput = noArc;
// @ts-expect-error No timing key is inferred.
const missingKey: DirectedAgeInput = noKey;
// @ts-expect-error No elapsed-year unit is inferred.
const missingYear: DirectedAgeInput = noYear;
// @ts-expect-error A solar key requires solar samples.
const missingSolar: DirectedAgeInput = { ...fixed, key: "solar-equatorial-birth-day" };
// @ts-expect-error Fixed keys cannot silently carry ignored solar samples.
const mixedFixed: DirectedAgeInput = { ...fixed, solar: samples };
// @ts-expect-error An absent solar option is not an explicit undefined.
const undefinedSolar: DirectedAgeInput = { ...fixed, solar: undefined };
// @ts-expect-error Timing keys are explicitly enumerated.
const unsupportedKey: DirectedAgeInput = { ...fixed, key: "solar-arc" };
// @ts-expect-error Elapsed-day conversions need a named supported year.
const arbitraryYear: DirectedAgeInput = { ...fixed, yearUnit: "calendar-year" };
// @ts-expect-error Timing accepts arc magnitudes, not an implicit motion convention.
const motionChoice: DirectedAgeInput = { ...fixed, motion: "converse" };
// @ts-expect-error Input arcs are numeric degrees.
const stringArc: DirectedAgeInput = { ...fixed, arcDegrees: "12.5" };
// @ts-expect-error Samples must explicitly use TT.
const utcSamples: SolarEquatorialDay = { ...samples, timeScale: "utc" };
// @ts-expect-error A geometric solar place is a different convention.
const geometricSamples: SolarEquatorialDay = { ...samples, correction: "geometric" };
// @ts-expect-error Both TT epochs are required.
const missingEpoch: SolarEquatorialDay = { ...samples, start: { rightAscensionDegrees: 100 } };
// @ts-expect-error Both right ascensions are required.
const missingRa: SolarEquatorialDay = { ...samples, end: { jdTt: 2451546 } };

// Never executed: compile the public readonly input, result and error contracts.
function readonlyTiming(input: DirectedAgeInput, result: DirectedAge, error: TimingError): void {
  const computed: DirectedAge = directedAge(solar);
  const year: DirectionYearUnit = result.yearUnit;
  const code: TimingErrorCode = error.code;
  // @ts-expect-error The input cannot be omitted.
  directedAge();
  // @ts-expect-error Returned arc magnitudes are readonly.
  result.arcDegrees = 0;
  // @ts-expect-error Returned ages are readonly.
  result.directedAgeYears = 0;
  // @ts-expect-error Refusal codes are readonly.
  error.code = "invalid-input";
  if (input.key === "solar-equatorial-birth-day") {
    // @ts-expect-error Nested sample data are readonly.
    input.solar.start.jdTt = 0;
  }
  // @ts-expect-error Input choices are readonly.
  input.key = "naibod";
  if (result.audit.kind === "fixed") {
    const source: "ptolemy-ashmand-iii14" | "kuehr-1936-naibod" = result.audit.source;
    // @ts-expect-error Rational rate evidence is readonly.
    result.audit.rationalDegreesPerYear.numerator = 0;
    void source;
  } else {
    const source: "lilly-1647-keys" = result.audit.source;
    const interval: 1 = result.audit.intervalTtDays;
    const turns: 0 | 1 = result.audit.wholeTurnsAdded;
    const sample: SolarEquatorialDay = result.audit.samples;
    // @ts-expect-error The output freezes solar samples recursively.
    result.audit.samples.end.rightAscensionDegrees = 0;
    // @ts-expect-error Audit metadata is readonly.
    result.audit.advanceDegrees = 0;
    void [source, interval, turns, sample];
  }
  void [computed, year, code];
}
void [missingArc, missingKey, missingYear, missingSolar, mixedFixed, undefinedSolar,
  unsupportedKey, arbitraryYear, motionChoice, stringArc, utcSamples, geometricSamples,
  missingEpoch, missingRa, readonlyTiming];
