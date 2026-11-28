import { parseDirectionConvention } from "./conventions.js";
import type { DirectionConvention } from "./conventions.js";
import { parseHit } from "./hit.js";
import type { DirectionHit, HitAngle, HitInput, HitRefusal } from "./hit.js";
import type { NatalSnapshot } from "./natal.js";
import type { DirectionEclipticPoint } from "./zodiacal.js";
import type { DirectionEquatorialPoint } from "./mundane.js";

export interface NatalBodySelection {
  readonly kind: "body";
  readonly id: string;
}

type Selection<Input> = Input extends HitInput
  ? Omit<Input, "geometry" | "significator" | "promissor"> & {
    readonly significator: NatalBodySelection | HitAngle;
    readonly promissor: NatalBodySelection;
  } : never;

/** Select exact snapshot labels; coordinates and geometry come from that snapshot. */
export type NatalHitSelection = Selection<HitInput>;

export interface NatalHitAudit {
  /** Supplied metadata is an assertion, not an authenticated engine receipt. */
  readonly source: "supplied-natal-snapshot";
  readonly instantLabel: string;
  readonly timeScale: NatalSnapshot["chart"]["timeScale"];
  readonly deltaT: NatalSnapshot["chart"]["deltaT"];
  readonly geometry: NatalSnapshot["geometry"];
  readonly houseSystem: string;
  readonly flags: readonly string[];
  readonly provenance: NatalSnapshot["provenance"];
  readonly significator:
    | { readonly kind: "body"; readonly id: string; readonly ecliptic: DirectionEclipticPoint }
    | (HitAngle & { readonly longitudeDegrees: number });
  readonly promissor: { readonly kind: "body"; readonly id: string; readonly ecliptic: DirectionEclipticPoint };
  /** The snapshot has no represented TT Julian date to bind a solar sample to. */
  readonly solarEpochAssociation: "caller-supplied-unverified" | null;
}

export type NatalHitErrorCode =
  | "invalid-snapshot" | "missing-body" | "ambiguous-body"
  | "inconsistent-snapshot" | "undefined-right-ascension" | "polar-geometry";

export interface NatalHitRefusal {
  readonly status: "refused";
  readonly stage: "natal";
  readonly code: NatalHitErrorCode;
  readonly message: string;
}

export type NatalHitResult = (DirectionHit & { readonly natal: NatalHitAudit }) | HitRefusal | NatalHitRefusal;

class NatalError extends RangeError {
  constructor(readonly code: NatalHitErrorCode, message: string) { super(message); }
}
class SelectionError extends RangeError {}

function invalid(message: string): never { throw new NatalError("invalid-snapshot", message); }
function inconsistent(message: string): never { throw new NatalError("inconsistent-snapshot", message); }

function plain(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    && [Object.prototype, null].includes(Object.getPrototypeOf(input));
}

/** Read only consumed own data slots. Unselected snapshot metadata is untouched. */
function pick(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!plain(input)) return invalid("Consumed natal records must be plain data objects.");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      return invalid("Consumed natal fields must be explicit enumerable data properties.");
    }
    result[field] = descriptor.value;
  }
  return result;
}

function selectionData(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!plain(input)) throw new SelectionError("Natal hit selection must consist of plain data objects.");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (required.some(field => !Object.hasOwn(descriptors, field)) || keys.some(key =>
    typeof key !== "string" || ![...required, ...optional].includes(key))) {
    throw new SelectionError("Provide every required selection field and no unknown fields.");
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      throw new SelectionError("Selection fields must be explicit enumerable data properties.");
    }
    result[key] = descriptor.value;
  }
  return result;
}

function label(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function select(input: unknown, allowAngle: boolean): NatalBodySelection | HitAngle {
  const values = selectionData(input, ["kind"], ["id", "angle"]);
  if (Object.keys(values).length !== 2) throw new SelectionError("Select only a body id or an angle.");
  if (values.kind === "body" && label(values.id)) return { kind: "body", id: values.id };
  if (allowAngle && values.kind === "angle"
    && (values.angle === "asc" || values.angle === "mc" || values.angle === "dsc" || values.angle === "ic")) {
    return { kind: "angle", angle: values.angle };
  }
  throw new SelectionError("Select an exact body label, or an explicit angle for the significator.");
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return invalid("Consumed natal numbers must be finite.");
  return value;
}

function degrees(value: unknown, min: number, max: number, exclusive = false): number {
  const number = finite(value);
  if (number < min || (exclusive ? number >= max : number > max)) {
    return invalid("Consumed natal coordinates must be in their canonical degree intervals.");
  }
  return number;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return invalid("Consumed natal metadata must be nonempty text.");
  return value;
}

function oneOf<const T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.some(choice => choice === value)) return invalid("Consumed natal metadata has an unsupported value.");
  return value as T;
}

function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) return invalid("Consumed natal rows and flags must be arrays.");
  const length = Object.getOwnPropertyDescriptor(input, "length")!.value as number;
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const slot = Object.getOwnPropertyDescriptor(input, String(index));
    if (!slot || !("value" in slot) || !slot.enumerable) {
      return invalid("Consumed natal arrays must contain explicit data elements.");
    }
    result.push(slot.value);
  }
  return result;
}

function selectedRow(rows: unknown, id: string): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  for (const row of array(rows)) {
    const name = pick(row, ["body"]).body;
    if (!label(name)) return invalid("Natal row labels must be nonempty, trimmed and free of control characters.");
    if (name !== id) continue;
    if (found) throw new NatalError("ambiguous-body", "A selected body label occurs more than once in natal rows.");
    found = row as Record<string, unknown>;
  }
  if (!found) throw new NatalError("missing-body", "A selected body label is absent from natal rows.");
  return found;
}

function ecliptic(row: unknown): DirectionEclipticPoint {
  const point = pick(row, ["lon", "lat"]);
  return { longitudeDegrees: degrees(point.lon, 0, 360, true), latitudeDegrees: degrees(point.lat, -90, 90) };
}

function deltaT(input: unknown): NatalHitAudit["deltaT"] {
  const values = pick(input, ["seconds", "sigma", "model", "table", "tableDigest", "segment"]);
  return {
    seconds: finite(values.seconds), sigma: values.sigma === null ? null : degrees(values.sigma, 0, Number.MAX_VALUE),
    model: oneOf(values.model, ["zodiacs-deltat/1", "iers-utc/1", "pinned"]),
    table: values.table === null ? null : string(values.table),
    tableDigest: values.tableDigest === null ? null : string(values.tableDigest),
    segment: oneOf(values.segment, ["long-term", "reconstructed", "observed", "predicted", "extrapolated", "pinned", "fallback"])
  };
}

function timeScale(input: unknown): NatalHitAudit["timeScale"] {
  const values = pick(input, ["input", "basis", "ut1MinusUtc", "leapSeconds"]);
  let ut1MinusUtc: NatalHitAudit["timeScale"]["ut1MinusUtc"] = null;
  let leapSeconds: NatalHitAudit["timeScale"]["leapSeconds"] = null;
  if (values.ut1MinusUtc !== null) {
    const offset = pick(values.ut1MinusUtc, ["seconds", "sigma", "source"]);
    ut1MinusUtc = { seconds: finite(offset.seconds), sigma: degrees(offset.sigma, 0, Number.MAX_VALUE),
      source: oneOf(offset.source, ["observed", "predicted", "fallback"]) };
  }
  if (values.leapSeconds !== null) {
    const leaps = pick(values.leapSeconds, ["taiMinusUtc", "listed"]);
    if (typeof leaps.listed !== "boolean") return invalid("Leap-second provenance requires a boolean listed field.");
    leapSeconds = { taiMinusUtc: finite(leaps.taiMinusUtc), listed: leaps.listed };
  }
  return { input: oneOf(values.input, ["utc", "ut1", "tt"]),
    basis: oneOf(values.basis, ["iers", "delta-t", "pinned"]), ut1MinusUtc, leapSeconds };
}

function provenance(input: unknown): NatalHitAudit["provenance"] {
  const values = pick(input, ["engineVersion", "ephemeris", "chart", "equatorial", "ramc", "inputInstant"]);
  const ephemeris = pick(values.ephemeris, ["name", "version"]);
  return {
    engineVersion: string(values.engineVersion),
    ephemeris: { name: oneOf(ephemeris.name, ["astronomy-engine"]), version: string(ephemeris.version) },
    chart: oneOf(values.chart, ["@zodiacs/engine:natalChart"]),
    equatorial: oneOf(values.equatorial, ["@zodiacs/engine:chartDeclinations"]),
    ramc: oneOf(values.ramc, ["@zodiacs/engine:eclipticToEquatorial(mc,0,trueObliquity)"]),
    inputInstant: oneOf(values.inputInstant, ["chart.input.utc is an ISO label on chart.timeScale.input"])
  };
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * Pure selection from supplied natal data. Calls no ephemeris or time resolver.
 * Only consumed snapshot slots are checked; this is not a receipt validator.
 * Solar samples keep their caller-asserted epoch association visible in audit.
 */
export function hitFromNatal(snapshot: NatalSnapshot, selection: NatalHitSelection): NatalHitResult {
  try {
    const choice = selectionData(selection, ["convention", "significator", "promissor", "contact", "yearUnit"], ["solar"]);
    let convention: DirectionConvention;
    try { convention = parseDirectionConvention(choice.convention); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return Object.freeze({ status: "refused", stage: "convention", code: "invalid-input", message: error.message });
    }
    const s = select(choice.significator, true);
    const p = select(choice.promissor, false) as NatalBodySelection;
    const top = pick(snapshot, ["chart", "geometry", "provenance"]);
    const chart = pick(top.chart, ["input", "bodies", "timeScale", "deltaT", "houses", "flags", "engineVersion"]);
    const input = pick(chart.input, ["utc", "timeKnown", "latitude", "longitude", "houseSystem"]);
    const supplied = pick(top.geometry, ["latitudeDegrees", "longitudeDegrees", "trueObliquityDegrees", "ramcDegrees"]);
    const geometry = {
      latitudeDegrees: degrees(supplied.latitudeDegrees, -90, 90),
      longitudeDegrees: degrees(supplied.longitudeDegrees, -180, 180),
      trueObliquityDegrees: degrees(supplied.trueObliquityDegrees, 0, 90, true),
      ramcDegrees: degrees(supplied.ramcDegrees, 0, 360, true)
    };
    if (input.timeKnown !== true || input.latitude !== geometry.latitudeDegrees || input.longitude !== geometry.longitudeDegrees) {
      return inconsistent("Natal input must assert known time and agree with the snapshot place.");
    }
    if (Math.abs(geometry.latitudeDegrees) >= 90 - geometry.trueObliquityDegrees) {
      throw new NatalError("polar-geometry", "Natal geometry is outside the complete-ecliptic semi-arc domain.");
    }
    const instantLabel = string(input.utc);
    if (!/^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(instantLabel)
      || !Number.isFinite(Date.parse(instantLabel)) || new Date(instantLabel).toISOString() !== instantLabel) {
      return invalid("Natal instant must be the snapshot's normalized ISO clock label.");
    }
    const clock = timeScale(chart.timeScale);
    const inputScale = Object.getOwnPropertyDescriptor(chart.input, "timeScale");
    if (inputScale && (!("value" in inputScale) || !inputScale.enumerable)) {
      return invalid("Natal input scale must be an enumerable data property when present.");
    }
    if ((inputScale ? inputScale.value : "utc") !== clock.input) return inconsistent("Natal clock labels name different input scales.");
    const dt = deltaT(chart.deltaT);
    const origin = provenance(top.provenance);
    if (origin.engineVersion !== chart.engineVersion) return inconsistent("Natal engine version claims disagree.");
    const houseSystem = string(pick(chart.houses, ["system"]).system);
    if (houseSystem !== input.houseSystem) return inconsistent("Natal requested and supplied house systems disagree.");
    const flags = array(chart.flags).map(string);
    if (flags.includes("no-time") || flags.includes("polar-fallback")) {
      return inconsistent("Natal flags deny the required known time or unchanged house geometry.");
    }
    let equatorial: Record<string, unknown> | undefined;
    if (convention.mode === "mundane") {
      equatorial = pick(pick(snapshot, ["equatorial"]).equatorial, ["rows", "trueObliquity", "convention", "utc", "deltaT"]);
      if (equatorial.trueObliquity !== geometry.trueObliquityDegrees || equatorial.utc !== instantLabel
        || equatorial.convention !== "true-equator-and-equinox-of-date; full-ecliptic-longitude-and-latitude"
        || JSON.stringify(deltaT(equatorial.deltaT)) !== JSON.stringify(dt)) {
        return inconsistent("Natal equatorial rows do not describe the same clock, obliquity and frame.");
      }
    }
    function body(selected: NatalBodySelection): {
      hit: { kind: "body"; id: string; coordinates: DirectionEclipticPoint | DirectionEquatorialPoint };
      audit: { kind: "body"; id: string; ecliptic: DirectionEclipticPoint };
    } {
      const coordinates = ecliptic(selectedRow(chart.bodies, selected.id));
      let operative: DirectionEclipticPoint | DirectionEquatorialPoint = coordinates;
      if (equatorial) {
        const row = selectedRow(equatorial.rows, selected.id);
        const rowEcliptic = ecliptic(row);
        if (rowEcliptic.longitudeDegrees !== coordinates.longitudeDegrees || rowEcliptic.latitudeDegrees !== coordinates.latitudeDegrees) {
          return inconsistent("A selected equatorial row disagrees with the chart body's longitude or latitude.");
        }
        const point = pick(row, ["ra", "dec", "raDefined"]);
        if (point.raDefined !== true || point.ra === null) {
          throw new NatalError("undefined-right-ascension", "A selected natal body has no defined right ascension.");
        }
        operative = { rightAscensionDegrees: degrees(point.ra, 0, 360, true), declinationDegrees: degrees(point.dec, -90, 90) };
      }
      return { hit: { ...selected, coordinates: operative }, audit: { ...selected, ecliptic: coordinates } };
    }
    const promissor = body(p);
    const significator = s.kind === "body" ? body(s) : {
      hit: s, audit: { ...s, longitudeDegrees: degrees(pick(pick(top.chart, ["angles"]).angles, [s.angle])[s.angle], 0, 360, true) }
    };
    const result = parseHit({
      convention, geometry: convention.mode === "zodiacal"
        ? { ramcDegrees: geometry.ramcDegrees, latitudeDegrees: geometry.latitudeDegrees, trueObliquityDegrees: geometry.trueObliquityDegrees }
        : { ramcDegrees: geometry.ramcDegrees, latitudeDegrees: geometry.latitudeDegrees },
      significator: significator.hit, promissor: promissor.hit, contact: choice.contact, yearUnit: choice.yearUnit,
      ...(Object.hasOwn(choice, "solar") ? { solar: choice.solar } : {})
    });
    if (result.status === "refused") return result;
    return freeze({ ...result, natal: {
      source: "supplied-natal-snapshot", instantLabel, timeScale: clock, deltaT: dt, geometry,
      houseSystem, flags, provenance: origin, significator: significator.audit, promissor: promissor.audit,
      solarEpochAssociation: convention.key === "solar-equatorial-birth-day" ? "caller-supplied-unverified" : null
    } });
  } catch (error) {
    if (error instanceof SelectionError) return Object.freeze({ status: "refused", stage: "input", code: "invalid-input", message: error.message });
    if (error instanceof NatalError) return Object.freeze({ status: "refused", stage: "natal", code: error.code, message: error.message });
    throw error;
  }
}
