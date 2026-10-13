import * as wasm from "../pkg/zodiacs_rustcore.js";
import type { DateInput, SignDefinition } from "../../src/types.js";
import type { CalendarName, CivilDate } from "../../src/civil-calendar.js";
import { SIGNS } from "./sign-data.js";
import type { DeltaT, DeltaTTable, DeltaTSegment } from "../../src/deltat.js";
import type { TimeBasis, TimeScale, TimeScaleName, Ut1MinusUtc, LeapSeconds } from "../../src/time-scale.js";
import type { Tilt } from "../../src/nutation.js";
import type { EclipticFrame } from "../../src/frame.js";
import type { Rows } from "../../src/equator.js";
import type { AstroTime } from "astronomy-engine";
import { NUTATION_TERMS } from "./nutation-data.js";

export { ELEMENTS, MODALITIES, SIGNS, SIGN_SLUGS, SIGN_NAMES } from "./sign-data.js";
export type { DateInput, SignDefinition, CalendarName, CivilDate };
export type { DeltaT, DeltaTTable, DeltaTSegment, TimeBasis, TimeScale, TimeScaleName, Ut1MinusUtc, LeapSeconds };
export type { Tilt, EclipticFrame, Rows };
export { ARGUMENTS, MULTIPLIERS, OFFSETS, NUTATION_TERMS } from "./nutation-data.js";
export {
  DELTA_T_MODEL, DELTA_T_TABLE, DELTA_T_IERS_MODEL, TIME_SCALE_NAMES,
  LEAP_SECOND_LIST, UT1_DATA, LEAP_SECONDS_FROM, UT1_FALLBACK_BAND
} from "../generated/time-data.js";

let initialized = false;

/** Supply the locally built WASM bytes or a compiled module before calculation. */
export function initRustCore(module: BufferSource | WebAssembly.Module): void {
  wasm.initSync({ module });
  initialized = true;
}

function ready(): void {
  if (!initialized) throw new Error("Call initRustCore with the WASM module before calculating.");
}

function finiteLongitude(lon: number): void {
  // Keep the JS boundary strict: wasm-bindgen would coerce null or strings.
  if (!Number.isFinite(lon)) throw new RangeError("Longitude must be finite.");
}

/** Same numeric signature and finite-input validation as src/signs.ts. */
export function normalizeLongitude(lon: number): number {
  ready();
  finiteLongitude(lon);
  return wasm.normalizeLongitude(lon);
}

export function signIndexForLongitude(lon: number): number {
  ready();
  finiteLongitude(lon);
  return wasm.signIndexForLongitude(lon);
}

export function degreeInSign(lon: number): number {
  ready();
  finiteLongitude(lon);
  return wasm.degreeInSign(lon);
}

/** Reuse the frozen metadata object, as the reference does. */
export function signForLongitude(lon: number): SignDefinition {
  return SIGNS[signIndexForLongitude(lon)]!;
}

export function separation(a: number, b: number): number {
  ready();
  return wasm.separation(a, b);
}

export function wrap360(value: number): number {
  ready();
  return wasm.wrap360(value);
}

export function signedDelta(from: number, to: number): number {
  ready();
  return wasm.signedDelta(from, to);
}

export function advance(from: number, to: number): number {
  ready();
  return wasm.advance(from, to);
}

export function antiscion(longitude: number): number {
  ready();
  return wasm.antiscion(longitude);
}

export function contraAntiscion(longitude: number): number {
  ready();
  return wasm.contraAntiscion(longitude);
}

export function midpoint(first: number, second: number): number {
  ready();
  return wasm.midpoint(first, second);
}

/** Input classification and Date allocation stay at the JavaScript boundary. */
export function dateFrom(input: DateInput, label: string): Date {
  ready();
  let milliseconds: number | undefined;
  if (input instanceof Date) {
    milliseconds = wasm.dateFromMillis(Date.prototype.getTime.call(input));
  } else if (typeof input === "number") {
    milliseconds = wasm.dateFromMillis(input);
  } else if (typeof input === "string") {
    milliseconds = wasm.dateFromIso(input);
  }
  if (milliseconds !== undefined) return new Date(milliseconds);
  // Keep labels in JS: UTF-8 encoding for a Rust string would replace lone
  // UTF-16 surrogates, changing the reference's error message.
  throw new RangeError(
    `${label} must be a valid Date, finite epoch-millisecond timestamp, or ISO calendar date/date-time with an explicit UTC offset.`
  );
}

function civilDate(fields: Float64Array): CivilDate {
  return { year: fields[0]!, month: fields[1]!, day: fields[2]! };
}

export function parseCalendarDate(value: unknown, calendar: CalendarName): CivilDate | null {
  ready();
  if (typeof value !== "string") return null;
  const fields = wasm.parseCalendarDate(value, calendar === "julian");
  return fields ? civilDate(fields) : null;
}

export function julianDayNumber(date: CivilDate, calendar: CalendarName): number {
  ready();
  return wasm.julianDayNumber(date.year, date.month, date.day, calendar === "julian");
}

export function civilDateOf(jdn: number, calendar: CalendarName): CivilDate {
  ready();
  return civilDate(wasm.civilDateOf(jdn, calendar === "julian"));
}

/** String formatting stays in JS so its Number-to-string rules are unchanged. */
export function format(date: CivilDate): string | null {
  ready();
  if (date.year < 0 || date.year > 9999) return null;
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function julianToGregorian(value: string): string | null {
  ready();
  if (typeof value !== "string") return null;
  return wasm.julianToGregorian(value) ?? null;
}

export function gregorianToJulian(value: string): string | null {
  ready();
  if (typeof value !== "string") return null;
  return wasm.gregorianToJulian(value) ?? null;
}

export function deltaT(ut: number): number {
  ready();
  if (!Number.isFinite(ut)) throw new RangeError("deltaT takes a finite UT: days since 2000-01-01T12:00 on UT1.");
  return wasm.deltaT(ut);
}

export function deltaTAt(ut: number): DeltaT {
  ready();
  if (!Number.isFinite(ut)) throw new RangeError("deltaTAt takes a finite UT: days since 2000-01-01T12:00 on UT1.");
  return wasm.deltaTAt(ut) as DeltaT;
}

export function taiMinusUtcAt(utcMs: number): number {
  ready();
  return wasm.taiMinusUtcAt(utcMs);
}

export function ut1MinusUtcAt(utcMs: number): Ut1MinusUtc {
  ready();
  return wasm.ut1MinusUtcAt(utcMs) as Ut1MinusUtc;
}

export function timeBasis(ms: number, scale: TimeScaleName = "utc", pin?: number): TimeBasis {
  ready();
  return wasm.timeBasis(ms, scale === "tt" ? 2 : scale === "ut1" ? 1 : 0, pin) as TimeBasis;
}

export function elapsedDays(before: TimeBasis, after: TimeBasis, days: number): number {
  ready();
  return wasm.elapsedDays(before, after, days);
}

let coefficientValues: readonly number[] | undefined;

export function coefficients(): readonly number[] {
  ready();
  return (coefficientValues ??= Object.freeze(Array.from(wasm.coefficients())));
}

export function nutation(t: number, terms = NUTATION_TERMS): { dpsi: number; deps: number; om: number } {
  ready();
  const fields = wasm.nutation(t, terms);
  return { dpsi: fields[0]!, deps: fields[1]!, om: fields[2]! };
}

function tiltRecord(fields: Float64Array, offset = 0): Tilt {
  return {
    dpsi: fields[offset]!, deps: fields[offset + 1]!, mobl: fields[offset + 2]!,
    tobl: fields[offset + 3]!, ee: fields[offset + 4]!
  };
}

export function tilt(tt: number): Tilt {
  ready();
  return tiltRecord(wasm.tilt(tt));
}

export function meanObliquity(julianCenturies: number): number {
  ready();
  return wasm.meanObliquity(julianCenturies);
}

export function gastHours(time: AstroTime): number {
  ready();
  return wasm.gastHours(time.ut, time.tt);
}

let lastFrame: EclipticFrame | undefined;

export function eclipticFrame(tt: number): EclipticFrame {
  ready();
  if (lastFrame !== undefined && lastFrame.tt === tt) return lastFrame;
  const fields = wasm.eclipticFrame(tt);
  lastFrame = Object.freeze({
    tt, rows: Object.freeze(Array.from(fields.slice(0, 9))),
    tilt: Object.freeze(tiltRecord(fields, 9))
  });
  return lastFrame;
}

function vector(fields: Float64Array): [number, number, number] {
  return [fields[0]!, fields[1]!, fields[2]!];
}

function rows(fields: Float64Array): Rows {
  return [fields[0]!, fields[1]!, fields[2]!, fields[3]!, fields[4]!,
    fields[5]!, fields[6]!, fields[7]!, fields[8]!];
}

export function meanEcliptic(frame: EclipticFrame, x: number, y: number, z: number): [number, number, number] {
  ready();
  return vector(wasm.meanEcliptic(Float64Array.from(frame.rows), x, y, z));
}

export function eclipticOfDate(x: number, y: number, z: number, tt: number): { lon: number; lat: number } {
  ready();
  const fields = wasm.eclipticOfDate(x, y, z, tt);
  return { lon: fields[0]!, lat: fields[1]! };
}

export function eclipticRows(tt: number, kind: "mean" | "true"): Rows {
  ready();
  return kind === "mean" ? eclipticFrame(tt).rows as Rows : rows(wasm.eclipticRows(tt, false));
}

export function equatorRows(tt: number, kind: "mean" | "true"): Rows {
  ready();
  return rows(wasm.equatorRows(tt, kind === "mean"));
}

export function turn(m: Rows, x: number, y: number, z: number): [number, number, number] {
  ready();
  return vector(wasm.turn(Float64Array.from(m), x, y, z));
}

/** Bodies implemented by the solar and planetary series milestone. */
export type SeriesBody = "Sun" | "Mercury" | "Venus" | "Earth" | "Mars" |
  "Jupiter" | "Saturn" | "Uranus" | "Neptune";

/** J2000 day clocks with a fixed TT - UT1 in seconds for light-time samples. */
export interface PlanetClock {
  ut: number;
  tt: number;
  deltaT: number;
}

/** Cartesian position in AU, on the mean equator and equinox of J2000. */
export interface PlanetVector { x: number; y: number; z: number }

/** Cartesian velocity in AU per TT day, with its heliocentric position. */
export interface PlanetState extends PlanetVector { vx: number; vy: number; vz: number }

/** Emission clocks in J2000 days, attached to the backdated relative vector. */
export interface BackdatedPlanetVector extends PlanetVector { ut: number; tt: number }

function seriesBody(body: SeriesBody): void {
  switch (body) {
    case "Sun": case "Mercury": case "Venus": case "Earth": case "Mars":
    case "Jupiter": case "Saturn": case "Uranus": case "Neptune": return;
    default: throw new RangeError("Body is not supported by the planetary series kernel.");
  }
}

function finitePlanetTt(tt: number): void {
  if (!Number.isFinite(tt)) throw new RangeError("Planetary series require finite TT days since J2000.");
}

function planetClock(clock: PlanetClock, aberration: boolean): PlanetClock {
  if (clock === null || typeof clock !== "object") {
    throw new RangeError("Planetary light-time calculation requires a clock record.");
  }
  const { ut, tt, deltaT } = clock;
  if (![ut, tt, deltaT].every(Number.isFinite)) {
    throw new RangeError("Planetary light-time calculation requires finite UT1, TT and Delta T.");
  }
  if (typeof aberration !== "boolean") throw new RangeError("Aberration must be a boolean.");
  return { ut, tt, deltaT };
}

function planetVector(fields: Float64Array): PlanetVector {
  return { x: fields[0]!, y: fields[1]!, z: fields[2]! };
}

/** Low-level series helper; complete engine positions are a later milestone. */
export function helioVector(body: SeriesBody, ttDays: number): PlanetVector {
  ready();
  seriesBody(body);
  finitePlanetTt(ttDays);
  return planetVector(wasm.helioVector(body, ttDays));
}

export function helioState(body: SeriesBody, ttDays: number): PlanetState {
  ready();
  seriesBody(body);
  finitePlanetTt(ttDays);
  const fields = wasm.helioState(body, ttDays);
  return { ...planetVector(fields), vx: fields[3]!, vy: fields[4]!, vz: fields[5]! };
}

export function backdatePosition(
  observer: SeriesBody, target: SeriesBody, clock: PlanetClock, aberration = true,
): BackdatedPlanetVector {
  ready();
  seriesBody(observer);
  seriesBody(target);
  const { ut, tt, deltaT } = planetClock(clock, aberration);
  const fields = wasm.backdatePosition(observer, target, ut, tt, deltaT, aberration);
  return { ...planetVector(fields), ut: fields[3]!, tt: fields[4]! };
}

export function geoVector(body: SeriesBody, clock: PlanetClock, aberration = true): PlanetVector {
  ready();
  seriesBody(body);
  const { ut, tt, deltaT } = planetClock(clock, aberration);
  return planetVector(wasm.geoVector(body, ut, tt, deltaT, aberration));
}
