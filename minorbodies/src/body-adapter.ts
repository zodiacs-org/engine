/** Companion dispatch over calc's closed body list. No engine provider is patched. */
import { CALC_BODIES, calc } from "../../src/calc.js";
import type { CalcBody, CalcPosition, CalcReceipt, CalcRefusal, CalcRequest, CalcTime } from "../../src/calc.js";
import type { AspectPosition } from "../../src/configured-aspects.js";
import type { BodyLongitudeAt } from "../../src/crossings.js";
import type { TimeScaleName } from "../../src/time-scale.js";
import { isMinorBody, MINOR_BODY_NAMES } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";
import { POSITION_CONVENTIONS } from "./ephemeris.ts";
import type { DatasetReceipt, MinorBodyEphemeris, MinorBodyPosition, MinorBodyRefusal, PositionReceipt } from "./ephemeris.ts";
import { readAdapterSourceIdentity } from "./engine-identity.ts";
import type { EngineSourceIdentity } from "./engine-identity.ts";
import { deltaTPin, fields, readAdapterTime, resolveAdapterTime, snapshot } from "./adapter-input.ts";
import type { AdapterTimeReceipt, AdapterTimeRequest } from "./adapter-input.ts";

export type AdapterBody = CalcBody | MinorBody;
export type BodyAdapterRequest = Omit<CalcRequest, "body"> & { readonly body: AdapterBody };
export type BodyAdapterProvider = "engine" | "minorbodies" | null;

export interface BodyAdapterReceipt {
  readonly schema: "minorbodies-body-adapter-v1";
  readonly implementation: EngineSourceIdentity;
  /** Snapshot of the supplied request, Dates represented as ISO readings. */
  readonly request: BodyAdapterRequest;
  readonly provider: BodyAdapterProvider;
  readonly dataset: DatasetReceipt | null;
  /** Available for resolved minor-body requests; engine results retain their own instants. */
  readonly time: AdapterTimeReceipt | null;
  readonly minorBodyConventions: typeof POSITION_CONVENTIONS | null;
  readonly calculation: CalcReceipt<CalcRequest> | PositionReceipt | null;
}
export type BodyAdapterPosition =
  | { readonly status: "ok"; readonly provider: "engine"; readonly result: CalcPosition; readonly receipt: BodyAdapterReceipt }
  | { readonly status: "ok"; readonly provider: "minorbodies"; readonly result: MinorBodyPosition; readonly receipt: BodyAdapterReceipt };
export interface BodyAdapterRefusal {
  readonly status: "refused";
  readonly provider: BodyAdapterProvider;
  readonly reason: string;
  readonly detail: string;
  readonly refusal: CalcRefusal | MinorBodyRefusal | null;
  readonly receipt: BodyAdapterReceipt;
}
export type BodyAdapterResult = BodyAdapterPosition | BodyAdapterRefusal;

/** The intended corrections agree; the provider approximations are kept explicit. */
export const ASPECT_ROW_CONVENTIONS = Object.freeze({
  center: "geocentric", frame: "ecliptic-true-of-date", zodiac: "tropical",
  units: "degrees", speedClock: "tt-day", corrections: "receive-light-time;stellar-aberration;no-gravitational-deflection",
  engineApproximation: "engine-calc-apparent;newtonian-light-time;backdated-observer-aberration",
  minorBodyApproximation: "Horizons-LT+S",
  excluded: "Moon-series-at-instant;lunar-nodes;mean-lunar-apogee",
  scope: "coordinate-rows-only;provider-accuracy-and-orbit-uncertainty-remain-separate"
} as const);

export interface AspectRowsReceipt {
  readonly schema: "minorbodies-aspect-rows-v1";
  readonly implementation: EngineSourceIdentity;
  readonly bodies: readonly AdapterBody[];
  readonly requestTime: AdapterTimeRequest;
  readonly time: AdapterTimeReceipt | null;
  readonly conventions: typeof ASPECT_ROW_CONVENTIONS;
  /** Includes a failed calculation when a provider refused. No partial rows are returned. */
  readonly calculations: readonly BodyAdapterReceipt[];
}
export type AspectRowsResult =
  | { readonly status: "ok"; readonly rows: readonly AspectPosition[]; readonly receipt: AspectRowsReceipt }
  | { readonly status: "refused"; readonly reason: string; readonly body: AdapterBody | null;
      readonly refusal: BodyAdapterRefusal | null; readonly rows: readonly []; readonly receipt: AspectRowsReceipt };

export interface LongitudeCallbackOptions {
  /** A Date is a calendar reading on this scale, not necessarily a UTC instant. Default TT. */
  readonly dateScale?: TimeScaleName;
  readonly deltaT?: number;
}
export interface LongitudeCallbackReceipt {
  readonly schema: "minorbodies-longitude-callback-v1";
  readonly implementation: EngineSourceIdentity;
  readonly datasets: readonly DatasetReceipt[];
  readonly dateScale: TimeScaleName;
  readonly deltaT: number | null;
  readonly dateMeaning: "calendar-reading-on-dateScale;Date-Z-is-not-a-UTC-claim";
  readonly frame: "ecliptic-true-of-date";
  readonly zodiac: "tropical";
  readonly corrections: "provider-specific;inspect-calculateAt-receipt";
}
export interface LongitudeCallback {
  readonly longitudeAt: BodyLongitudeAt<AdapterBody>;
  readonly calculateAt: (body: AdapterBody, date: Date) => BodyAdapterResult;
  readonly receipt: LongitudeCallbackReceipt;
}

export class BodyAdapterRefusalError extends Error {
  readonly refusal: BodyAdapterRefusal;
  constructor(refusal: BodyAdapterRefusal) {
    super(`Body adapter refused longitude evaluation: ${refusal.reason}.`);
    this.name = "BodyAdapterRefusalError";
    this.refusal = refusal;
  }
}

function isEngineBody(body: unknown): body is CalcBody {
  return typeof body === "string" && (CALC_BODIES as readonly string[]).includes(body);
}
function validateLabel(body: unknown): asserts body is string {
  if (typeof body !== "string" || body.length < 1 || body.length > 80 || body.trim() !== body || /[\x00-\x1f\x7f]/.test(body)) {
    throw new RangeError("Adapter body must be a nonempty exact label without surrounding whitespace or controls.");
  }
}
function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

function unsupportedMinorRequest(request: BodyAdapterRequest): string | null {
  if (request.center !== undefined && request.center !== "geocentric") return "unsupported-center";
  if (request.frame !== undefined && request.frame !== "ecliptic-true-of-date") return "unsupported-frame";
  if (request.zodiac !== undefined && request.zodiac !== "tropical") return "unsupported-zodiac";
  const flags = request.flags === undefined ? {} : fields(request.flags,
    ["correction", "speeds", "cartesian", "units", "deflection"], "adapter flags");
  for (const key of ["speeds", "cartesian", "deflection"]) {
    if (flags[key] !== undefined && typeof flags[key] !== "boolean") throw new RangeError(`flags.${key} must be boolean.`);
  }
  if (flags.correction !== undefined && flags.correction !== "apparent") return "unsupported-correction";
  if (flags.deflection === true) return "unsupported-deflection";
  if (flags.units !== undefined && flags.units !== "degrees") return "unsupported-units";
  if (flags.speeds === false || flags.cartesian === true) return "unsupported-output";
  return null;
}

/** Capture sources once and bind explicitly loaded, disjoint body providers. No fetch or fit. */
export async function createBodyAdapter(ephemerides: readonly MinorBodyEphemeris[] = []) {
  if (!Array.isArray(ephemerides)) throw new RangeError("Adapter ephemerides must be an array.");
  const providers = new Map<MinorBody, MinorBodyEphemeris>();
  for (const ephemeris of ephemerides) {
    const body = ephemeris?.dataset?.sourceIdentity?.body;
    if (!isMinorBody(body) || typeof ephemeris.calculate !== "function" || providers.has(body)) {
      throw new RangeError("Adapter needs one loaded ephemeris per minor body, without duplicates.");
    }
    // The loaded provider is a trusted executable dependency, not a sandboxed plugin.
    providers.set(body, ephemeris);
  }
  const implementation = await readAdapterSourceIdentity();
  const datasets = Object.freeze([...providers.values()].map(item => item.dataset));

  function calcWithMinorBodies(input: BodyAdapterRequest): BodyAdapterResult {
    const request = snapshot(input);
    fields(request, ["body", "time", "frame", "center", "zodiac", "flags"], "adapter calculation request");
    validateLabel(request.body);
    const requestTime = readAdapterTime(request.time);
    const provider = isMinorBody(request.body) ? "minorbodies" : isEngineBody(request.body) ? "engine" : null;
    const ephemeris = isMinorBody(request.body) ? providers.get(request.body) : undefined;
    let time: AdapterTimeReceipt | null = null;
    const receipt = (calculation: BodyAdapterReceipt["calculation"] = null): BodyAdapterReceipt => Object.freeze({
      schema: "minorbodies-body-adapter-v1", implementation, request, provider,
      dataset: ephemeris?.dataset ?? null, time,
      minorBodyConventions: provider === "minorbodies" ? POSITION_CONVENTIONS : null, calculation
    });
    const refuse = (reason: string, detail: string, refusal: CalcRefusal | MinorBodyRefusal | null = null): BodyAdapterRefusal =>
      Object.freeze({ status: "refused", provider, reason, detail, refusal,
        receipt: receipt(refusal && "receipt" in refusal ? refusal.receipt : null) });
    if (isEngineBody(request.body)) {
      // Own snapshots avoid caller mutation. All option values and the input clock stay intact.
      const result = freezeTree(structuredClone(calc({ ...request, body: request.body })));
      return result.status === "ok"
        ? Object.freeze({ status: "ok", provider: "engine", result, receipt: receipt(result.receipt) })
        : refuse(result.reason, result.detail, result);
    }
    if (!isMinorBody(request.body)) return refuse("unknown-body", "Body is not in the engine or minor-body catalogue.");
    const unsupported = unsupportedMinorRequest(request);
    if (unsupported) return refuse(unsupported, "Minor bodies require apparent geocentric tropical true-of-date ecliptic degrees, full speeds, no Cartesian output and no deflection.");
    try { time = resolveAdapterTime(requestTime); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return refuse("invalid-time", "Time cannot be resolved within minor-body operational limits.");
    }
    if (!ephemeris) return refuse("body-unavailable", "No local dataset is installed for this body.");
    const result = ephemeris.calculate(request.body, { jd: time.jdTt, scale: "tt" });
    return result.status === "ok"
      ? Object.freeze({ status: "ok", provider: "minorbodies", result, receipt: receipt(result.receipt) })
      : refuse(result.reason, "The loaded minor-body evaluator refused this request.", result);
  }

  function aspectRows(bodies: readonly AdapterBody[], inputTime: CalcTime): AspectRowsResult {
    if (!Array.isArray(bodies) || bodies.length < 1 || bodies.length > CALC_BODIES.length + MINOR_BODY_NAMES.length ||
        Reflect.ownKeys(bodies).length !== bodies.length + 1) {
      throw new RangeError("Aspect rows require a nonempty array of catalogue labels.");
    }
    const selected: readonly AdapterBody[] = Object.freeze(Array.from({ length: bodies.length }, (_, index) => {
      const field = Object.getOwnPropertyDescriptor(bodies, String(index));
      if (!field || !("value" in field)) throw new RangeError("Aspect rows require own body data slots.");
      validateLabel(field.value);
      return field.value as AdapterBody;
    }));
    if (new Set(selected).size !== selected.length) throw new RangeError("Aspect row bodies must be unique.");
    const requestTime = readAdapterTime(inputTime);
    let time: AdapterTimeReceipt | null = null;
    const calculations: BodyAdapterReceipt[] = [];
    const receipt = (): AspectRowsReceipt => Object.freeze({ schema: "minorbodies-aspect-rows-v1", implementation,
      bodies: selected, requestTime, time, conventions: ASPECT_ROW_CONVENTIONS, calculations: Object.freeze([...calculations]) });
    const refuse = (reason: string, body: AdapterBody | null, refusal: BodyAdapterRefusal | null = null): AspectRowsResult =>
      Object.freeze({ status: "refused", reason, body, refusal, rows: Object.freeze([]) as readonly [], receipt: receipt() });
    try { time = resolveAdapterTime(requestTime); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return refuse("invalid-time", null);
    }
    const rows: AspectPosition[] = [];
    for (const body of selected) {
      if (["Moon", "North Node", "South Node", "Mean Node", "Mean South Node", "Black Moon Lilith"].includes(body)) {
        return refuse("incompatible-corrections", body);
      }
      const position = calcWithMinorBodies({ body, time: { jd: time.jdTt, scale: "tt",
        ...(requestTime.deltaT === undefined ? {} : { deltaT: requestTime.deltaT }) } });
      calculations.push(position.receipt);
      if (position.status === "refused") return refuse(position.reason, body, position);
      const lon = position.provider === "engine" ? position.result.lon : position.result.longitudeDeg;
      const speed = position.provider === "engine" ? position.result.speeds?.lon : position.result.longitudeSpeedDegPerDay;
      if (!Number.isFinite(lon) || lon < 0 || lon >= 360 || typeof speed !== "number" || !Number.isFinite(speed)) {
        return refuse("undefined-aspect-row", body);
      }
      rows.push(Object.freeze({ body, lon, speed }));
    }
    return Object.freeze({ status: "ok", rows: Object.freeze(rows), receipt: receipt() });
  }

  function createLongitudeCallback(options: LongitudeCallbackOptions = {}): LongitudeCallback {
    const given = fields(snapshot(options), ["dateScale", "deltaT"], "longitude callback options");
    const dateScale = given.dateScale === undefined ? "tt" : given.dateScale;
    if (dateScale !== "utc" && dateScale !== "ut1" && dateScale !== "tt") throw new RangeError("Callback dateScale must be utc, ut1 or tt.");
    const pin = deltaTPin(given.deltaT);
    const pinned = pin === undefined ? {} : { deltaT: pin };
    const receipt: LongitudeCallbackReceipt = Object.freeze({ schema: "minorbodies-longitude-callback-v1", implementation,
      datasets, dateScale, deltaT: pin ?? null, dateMeaning: "calendar-reading-on-dateScale;Date-Z-is-not-a-UTC-claim",
      frame: "ecliptic-true-of-date", zodiac: "tropical", corrections: "provider-specific;inspect-calculateAt-receipt" });
    const calculateAt = (body: AdapterBody, date: Date): BodyAdapterResult => {
      if (!(date instanceof Date)) throw new RangeError("Callback requires a valid Date reading.");
      const ms = Date.prototype.getTime.call(date);
      if (!Number.isFinite(ms)) throw new RangeError("Callback requires a valid Date reading.");
      const time: CalcTime = dateScale === "utc" ? { iso: new Date(ms).toISOString(), ...pinned }
        : { jd: 2451545 + (ms - Date.UTC(2000, 0, 1, 12)) / 86_400_000, scale: dateScale, ...pinned };
      return calcWithMinorBodies({ body, time });
    };
    const longitudeAt: BodyLongitudeAt<AdapterBody> = (body, date) => {
      const position = calculateAt(body, date);
      if (position.status === "refused") throw new BodyAdapterRefusalError(position);
      return position.provider === "engine" ? position.result.lon : position.result.longitudeDeg;
    };
    return Object.freeze({ longitudeAt, calculateAt, receipt });
  }

  return Object.freeze({ implementation, datasets, calcWithMinorBodies, aspectRows, createLongitudeCallback });
}

export type BodyAdapter = Awaited<ReturnType<typeof createBodyAdapter>>;
