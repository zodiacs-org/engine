import { MODALITIES } from "./engine.js";
import type { Modality } from "./engine.js";
import type { RuleSource } from "./policy.js";

export const TIMING_SOURCE: RuleSource = Object.freeze({
  id: "lilly-qualitative-timing;caller-unit-table",
  tradition: "Lilly's qualitative timing, with an explicit caller-selected unit table",
  reference: "William Lilly, Christian Astrology (first published 1647; linked edition 1659)",
  url: "https://pdfcoffee.com/william-lilly-christian-astrology-volume-1-pdf-free.html",
  locator: "Printed pp. 109-110, Separation: degrees, time units, sign quality, angularity and swiftness"
});
export const TIMING_CONVENTIONS = Object.freeze({
  degrees: "engine-reported-current-aspect-orb;rounded-exact-binary64-gap",
  geometry: "question-longitudes-and-actual-cusps;no-cusp-anticipation-or-latitude",
  units: "caller-table;no-historical-universal-matrix-implied",
  quantity: "degrees-times-units-per-degree;no-speed-division-or-calendar-conversion",
  eligibility: "exact-now-or-current-in-orb-application-with-sampled-contact",
  basis: "each-selected-physical-planet;alternatives-kept-separate",
  limitations: Object.freeze([
    "A symbolic quantity is not elapsed UTC time, a date prediction or an outcome.",
    "The current angular gap is not either planet's travelled arc to a moving contact.",
    "Contact candidates inherit the aspect search's sampling and clock limitations.",
    "Sign exits, stations, receptions and intervening contacts are not assessed here; a contact candidate may be interrupted.",
    "Different planet bases remain alternatives; they are not averaged, reconciled or ranked.",
    "No symbolic hints are inferred for translation or collection completion from this pair report."
  ])
} as const);
export const TIMING_HOUSE_KINDS = Object.freeze(["angular", "succedent", "cadent"] as const);
export const TIMING_UNITS = Object.freeze(["hours", "days", "weeks", "months", "years"] as const);
export type TimingHouseKind = typeof TIMING_HOUSE_KINDS[number];
export type TimingUnit = typeof TIMING_UNITS[number];
export type TimingBasis = "both" | "querent" | "quesited" | "moon";
export interface TimingScale {
  readonly unit: TimingUnit;
  /** Positive finite symbolic units per degree. Not a calendar or ephemeris rate. */
  readonly unitsPerDegree: number;
}
export type TimingCell = false | TimingScale;
export type TimingUnitTable = Readonly<Record<Modality, Readonly<Record<TimingHouseKind, TimingCell>>>>;
export interface TimingPolicyInput {
  readonly enabled?: boolean;
  readonly basis?: TimingBasis;
  /** Every omitted cell is disabled. A false cell independently disables that combination. */
  readonly units?: Readonly<Partial<Record<Modality, Readonly<Partial<Record<TimingHouseKind, TimingCell>>>>>>;
}
export interface HoraryTimingPolicy {
  readonly schema: "horary.timing-policy/v1";
  readonly enabled: boolean;
  readonly basis: TimingBasis;
  readonly units: TimingUnitTable;
}
const KEYS = ["enabled", "basis", "units"] as const;
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as typeof Object.prototype)) {
    throw new RangeError("Timing policy requires ordinary objects.");
  }
  for (const key of Reflect.ownKeys(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Timing policy has unsupported fields or non-data slots.");
    }
  }
  return value as Record<string, unknown>;
}
function cell(value: unknown): TimingCell {
  if (value === false) return false;
  const scale = object(value, ["unit", "unitsPerDegree"]);
  if (!TIMING_UNITS.includes(scale.unit as TimingUnit) || typeof scale.unitsPerDegree !== "number" ||
      !Number.isFinite(scale.unitsPerDegree) || scale.unitsPerDegree <= 0 || scale.unitsPerDegree > 1_000_000) {
    throw new RangeError("Timing scale requires a known unit and positive finite unitsPerDegree at most 1,000,000.");
  }
  return Object.freeze({ unit: scale.unit as TimingUnit, unitsPerDegree: scale.unitsPerDegree });
}

/** Timing is opt-in. No universal sign/house unit matrix is attributed to Lilly. */
export function createTimingPolicy(input: TimingPolicyInput = {}): HoraryTimingPolicy {
  const options = object(input, KEYS);
  const enabled = options.enabled === undefined ? false : options.enabled;
  if (typeof enabled !== "boolean") throw new RangeError("Timing enabled must be boolean.");
  const basis = options.basis === undefined ? "both" : options.basis;
  if (!["both", "querent", "quesited", "moon"].includes(basis as string)) {
    throw new RangeError("Timing basis must be both, querent, quesited or moon.");
  }
  const supplied = options.units === undefined ? {} : object(options.units, MODALITIES);
  const units = {} as Record<Modality, Readonly<Record<TimingHouseKind, TimingCell>>>;
  for (const modality of MODALITIES) {
    const row = Object.hasOwn(supplied, modality) ? object(supplied[modality], TIMING_HOUSE_KINDS) : {};
    const cells = {} as Record<TimingHouseKind, TimingCell>;
    for (const kind of TIMING_HOUSE_KINDS) cells[kind] = Object.hasOwn(row, kind) ? cell(row[kind]) : false;
    units[modality] = Object.freeze(cells);
  }
  return Object.freeze({ schema: "horary.timing-policy/v1", enabled, basis: basis as TimingBasis, units: Object.freeze(units) });
}
export function validateTimingPolicy(input: HoraryTimingPolicy): HoraryTimingPolicy {
  const options = object(input, ["schema", ...KEYS]);
  if (options.schema !== "horary.timing-policy/v1" || KEYS.some(key => !Object.hasOwn(options, key) || options[key] === undefined)) {
    throw new RangeError("Unsupported or incomplete timing policy snapshot.");
  }
  const units = object(options.units, MODALITIES);
  for (const modality of MODALITIES) {
    if (!Object.hasOwn(units, modality)) throw new RangeError("Incomplete timing modality snapshot.");
    const row = object(units[modality], TIMING_HOUSE_KINDS);
    if (TIMING_HOUSE_KINDS.some(kind => !Object.hasOwn(row, kind))) throw new RangeError("Incomplete timing house-unit snapshot.");
  }
  const { schema: _schema, ...rest } = options;
  return createTimingPolicy(rest as TimingPolicyInput);
}
