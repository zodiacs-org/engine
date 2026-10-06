// The time basis: from an instant on UTC, UT1 or TT to the UT1 that turns the
// Earth (sidereal time, the angles) and the TT that moves the planets.
//
// - From 1972-01-01 to the end of the IERS table (2027-10-02), UTC is the
//   leap-second scale: TT = UTC + (TAI − UTC) + 32.184 s exactly, with TAI −
//   UTC from the IERS leap-second list (updated 2026-07-06, expiring
//   2027-06-28; the last value is carried after it, as the table's own
//   predictions assume), and UT1 = TAI + (UT1 − TAI) from IERS: EOP 20 C04 in
//   1972, finals2000A.all of 2026-09-24 from 1973-01-02, observed then
//   predicted.
// - Before 1972 UTC as now is not defined: civil time is read as UT1, and
//   TT = UT1 + ΔT from the model (src/deltat.ts). After the table the same,
//   with UT1 − UTC taken as 0 within ±0.9 s.
// - A caller's ΔT (TT − UT1) replaces the rest: UT1 comes from the instant as
//   above, and TT = UT1 + ΔT.
import { DELTA_T_MODEL, deltaTAt } from "./deltat.js";
import type { DeltaT } from "./deltat.js";
import { LEAP_SECOND_LIST, UT1_DATA } from "./time-scale-data.js";

export { LEAP_SECOND_LIST, UT1_DATA };

/** The scale an input instant is on. UTC unless a caller says otherwise. */
export type TimeScaleName = "utc" | "ut1" | "tt";
export const TIME_SCALE_NAMES: readonly TimeScaleName[] = Object.freeze(["utc", "ut1", "tt"]);

/**
 * The ΔT model name for a value derived from leap seconds and IERS UT1 − UTC:
 * a chart's from 1972 to the end of the IERS UT1 table. DELTA_T_MODEL names
 * the model used at every other instant.
 */
export const DELTA_T_IERS_MODEL = "iers-utc/1";

/** UT1 − UTC as used: IERS observed or predicted, or 0 within 0.9 s outside the table. */
export interface Ut1MinusUtc {
  seconds: number;
  sigma: number;
  source: "observed" | "predicted" | "fallback";
}

/** TAI − UTC, s; `listed` is false after the list expires and its last value is carried. */
export interface LeapSeconds {
  taiMinusUtc: number;
  listed: boolean;
}

/** How an instant became UT1 and TT: "iers" (leap seconds, IERS UT1 − UTC), "delta-t" (read as UT1, the ΔT model) or "pinned". */
export interface TimeScale {
  input: TimeScaleName;
  basis: "iers" | "delta-t" | "pinned";
  /** Null before 1972. */
  ut1MinusUtc: Ut1MinusUtc | null;
  /** Null where TT did not come from the leap seconds. */
  leapSeconds: LeapSeconds | null;
}

/** An instant's UT1 and TT, days since 2000-01-01T12:00 on each scale, with its record. */
export interface TimeBasis {
  /**
   * The UTC instant, ms; where the civil instant is read as UT1, that instant.
   * An instant inside a leap second (23:59:60 on UTC) has no JavaScript
   * timestamp: it gets the one JavaScript gives that reading, the next day's
   * 00:00:00, with the TAI − UTC and UT1 − UTC in force during the leap second.
   */
  utcMs: number;
  ut1Days: number;
  ttDays: number;
  deltaT: DeltaT;
  timeScale: TimeScale;
}

const DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MJD_UNIX = 40_587;
/** 1972-01-01T00:00:00Z, the first day of the leap-second list. */
export const LEAP_SECONDS_FROM = Date.UTC(1972, 0, 1);
/** The first and last days (0h UTC) of the UT1 table, its first finals2000A day and its last observed day. */
const TABLE_FROM = (UT1_DATA.from - MJD_UNIX) * DAY;
const FINALS_FROM = (UT1_DATA.finalsFrom - MJD_UNIX) * DAY;
const TABLE_TO = (UT1_DATA.to - MJD_UNIX) * DAY;
const OBSERVED_TO = (UT1_DATA.observedTo - MJD_UNIX) * DAY;
const EXPIRES = Date.parse(`${LEAP_SECOND_LIST.expires}T00:00:00Z`);
/** Knots of the 3-day grid before the first finals2000A day: the grid runs from the table's second day. */
const GRID_BEFORE = Math.floor((UT1_DATA.finalsFrom - UT1_DATA.from - 1) / UT1_DATA.step);
/** The leap-second rule keeps |UT1 − UTC| below 0.9 s. */
export const UT1_FALLBACK_BAND = 0.9;
/** The generator's 90 characters: "#" to "~" without backslash and backquote. */
const ALPHABET = "#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz{|}~";

/** UT1 − TAI, ms, at each knot of the 3-day grid; decoded on first use. */
let knots: Float64Array | undefined;

function decode(): Float64Array {
  const { packed, radix, first, slope } = UT1_DATA;
  const count = GRID_BEFORE + Math.ceil((UT1_DATA.to - UT1_DATA.finalsFrom) / UT1_DATA.step) + 1;
  const values = new Float64Array(count);
  values[0] = first;
  let step = slope;
  const limit = (radix - 1) / 2;
  for (let index = 1; index < count; index += 1) {
    values[index] = values[index - 1]! + step;
    // Second differences come in pairs, one character each.
    const pair = index - 1;
    if (index + 1 < count) {
      const code = ALPHABET.indexOf(packed[pair >> 1]!);
      step += (pair & 1 ? code % radix : Math.floor(code / radix)) - limit;
    }
  }
  return values;
}

/** TAI − UTC, whole seconds, at a UTC instant from 1972 on. */
export function taiMinusUtcAt(utcMs: number): number {
  const mjd = Math.floor(utcMs / DAY) + MJD_UNIX;
  const changes = LEAP_SECOND_LIST.changes;
  let value = changes[0]![1];
  for (const [from, dtai] of changes) if (mjd >= from) value = dtai;
  return value;
}

/**
 * TAI − UTC in force at a TAI instant, ms. A change takes effect at 00:00:00
 * UTC under its new value; through a leap second, 23:59:60 on UTC, the old
 * value still holds.
 */
function taiMinusUtcAtTai(taiMs: number): number {
  const changes = LEAP_SECOND_LIST.changes;
  let value = changes[0]![1];
  for (const [from, dtai] of changes) if (taiMs >= (from - MJD_UNIX) * DAY + dtai * 1000) value = dtai;
  return value;
}

/**
 * UT1 − TAI in seconds at a UTC instant inside the table, linear between
 * knots: the first day's, then the 3-day grid's, which runs on the days of the
 * finals2000A rows and ends on the table's last day.
 */
function ut1MinusTai(utcMs: number): number {
  knots ??= decode();
  // Days from the first finals2000A day, the grid's reference.
  const days = (utcMs - FINALS_FROM) / DAY;
  const gridFrom = -GRID_BEFORE * UT1_DATA.step;
  if (days < gridFrom) {
    const fraction = (utcMs - TABLE_FROM) / DAY / (gridFrom - (UT1_DATA.from - UT1_DATA.finalsFrom));
    return (UT1_DATA.head + fraction * (knots[0]! - UT1_DATA.head)) / 1000;
  }
  const last = knots.length - 1;
  const k = Math.min(last - 1, GRID_BEFORE + Math.floor(days / UT1_DATA.step));
  const start = (k - GRID_BEFORE) * UT1_DATA.step;
  const end = k + 1 === last ? UT1_DATA.to - UT1_DATA.finalsFrom : start + UT1_DATA.step;
  const fraction = (days - start) / (end - start);
  return (knots[k]! + fraction * (knots[k + 1]! - knots[k]!)) / 1000;
}

/** The IERS formal error of UT1 − UTC near an instant, seconds, plus the table's own bound. */
function ut1Sigma(utcMs: number): number {
  if (utcMs < FINALS_FROM) return UT1_DATA.earlyError / 1e6 + UT1_DATA.bound;
  if (utcMs <= OBSERVED_TO) {
    const year = new Date(utcMs).getUTCFullYear() - UT1_DATA.firstYear;
    const errors = UT1_DATA.observedErrors;
    return errors[Math.max(0, Math.min(errors.length - 1, year))]! / 1e6 + UT1_DATA.bound;
  }
  const days = (utcMs - OBSERVED_TO) / DAY - 1;
  const errors = UT1_DATA.predictedErrors;
  const k = Math.max(0, Math.min(errors.length - 2, Math.floor(days / 10)));
  const span = k + 1 === errors.length - 1 ? UT1_DATA.to - UT1_DATA.observedTo - 1 - 10 * k : 10;
  const fraction = Math.max(0, Math.min(1, (days - 10 * k) / span));
  return (errors[k]! + fraction * (errors[k + 1]! - errors[k]!)) / 1e6 + UT1_DATA.bound;
}

const fallback = (): Ut1MinusUtc => ({ seconds: 0, sigma: UT1_FALLBACK_BAND, source: "fallback" });

/**
 * UT1 − UTC from the table at a UTC instant, with the TAI − UTC in force: the
 * table's value, band and source, carried linearly past its first or last day
 * for the fraction of a second a UT1 or TT instant inside it can reach there.
 */
function tableUt1MinusUtc(utcMs: number, taiMinusUtc: number): Ut1MinusUtc {
  return {
    seconds: ut1MinusTai(utcMs) + taiMinusUtc,
    sigma: ut1Sigma(utcMs),
    source: utcMs <= OBSERVED_TO ? "observed" : "predicted"
  };
}

/** UT1 − UTC at a UTC instant: from the table, or 0 within ±0.9 s outside it. */
export function ut1MinusUtcAt(utcMs: number): Ut1MinusUtc {
  if (utcMs < TABLE_FROM || utcMs > TABLE_TO) return fallback();
  return tableUt1MinusUtc(utcMs, taiMinusUtcAt(utcMs));
}

const modelDeltaT = (ut1Ms: number): DeltaT => deltaTAt((ut1Ms - J2000_MS) / DAY);

/**
 * UT1 and TT for an instant on `scale`, with the record a chart carries. A
 * pin is a caller's ΔT (TT − UT1) in seconds.
 */
export function timeBasis(ms: number, scale: TimeScaleName = "utc", pin?: number): TimeBasis {
  const record = (
    utcMs: number,
    ut1Ms: number,
    deltaT: DeltaT,
    basis: TimeScale["basis"],
    ut1MinusUtc: Ut1MinusUtc | null,
    leapSeconds: LeapSeconds | null
  ): TimeBasis => {
    const ut1Days = (ut1Ms - J2000_MS) / DAY;
    return {
      utcMs,
      ut1Days,
      ttDays: ut1Days + deltaT.seconds / 86_400,
      deltaT,
      timeScale: { input: scale, basis, ut1MinusUtc, leapSeconds }
    };
  };
  if (pin !== undefined) {
    const deltaT: DeltaT = { seconds: pin, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" };
    if (scale === "tt") return record(ms - pin * 1000, ms - pin * 1000, deltaT, "pinned", null, null);
    const ut1MinusUtc = scale === "utc" && ms >= LEAP_SECONDS_FROM ? ut1MinusUtcAt(ms) : null;
    return record(ms, ms + (ut1MinusUtc?.seconds ?? 0) * 1000, deltaT, "pinned", ut1MinusUtc, null);
  }
  const utc = scale === "tt" ? ms - modelDeltaT(ms).seconds * 1000 : ms;
  if (utc < LEAP_SECONDS_FROM || utc > TABLE_TO) {
    // Civil time read as UT1; for TT input, TT = UT1 + ΔT(UT1) by fixed-point steps.
    let ut1Ms = ms;
    if (scale === "tt") for (let round = 0; round < 4; round += 1) ut1Ms = ms - modelDeltaT(ut1Ms).seconds * 1000;
    return record(ut1Ms, ut1Ms, modelDeltaT(ut1Ms), "delta-t", utc > TABLE_TO && scale !== "ut1" ? fallback() : null, null);
  }
  // TAI = UTC + (TAI − UTC), TT = TAI + 32.184 s, and UT1 = TAI + (UT1 − TAI),
  // which runs on through leap seconds. From TT or UT1 the TAI − UTC is the one
  // in force at that TAI, the old one through a leap second.
  let taiMs: number;
  let taiMinusUtc: number;
  let utcMs = ms;
  if (scale === "utc") {
    taiMinusUtc = taiMinusUtcAt(ms);
    taiMs = ms + taiMinusUtc * 1000;
  } else {
    taiMs = scale === "tt" ? ms - 32_184 : ms - ut1MinusTai(ms) * 1000;
    taiMinusUtc = taiMinusUtcAtTai(taiMs);
    utcMs = taiMs - taiMinusUtc * 1000;
  }
  // The table answers throughout: a UT1 or TT instant on its last day can have
  // its UTC up to 0.148 s past it, where its last interval is carried on.
  const ut1 = tableUt1MinusUtc(utcMs, taiMinusUtc);
  const ut1Ms = scale === "ut1" ? ms : utcMs + ut1.seconds * 1000;
  return record(
    utcMs,
    ut1Ms,
    {
      seconds: (taiMs + 32_184 - ut1Ms) / 1000,
      sigma: ut1.sigma,
      model: DELTA_T_IERS_MODEL,
      table: UT1_DATA.version,
      tableDigest: UT1_DATA.digest,
      segment: ut1.source
    },
    "iers",
    scale === "ut1" ? { ...ut1, seconds: (ut1Ms - utcMs) / 1000 } : ut1,
    { taiMinusUtc, listed: utcMs < EXPIRES }
  );
}

/** The ΔT model's spline gives way to its knots at 1941.0, 1940-12-31T18:00 UT1 (src/deltat.ts), where its value steps. */
const MODEL_KNOTS_FROM = (1941 - 2000) * 365.25;

/**
 * Which piece of the time basis a record lies in: within one piece TT − (the
 * input instant) is continuous, and between two it can step. It steps at a
 * leap second on UTC input, where the basis changes (1972-01-01 and the table's
 * last day), where UT1 − UTC moves between the table and its fallback, and
 * where the ΔT model hands over from its spline to its knots. On TT input it
 * never steps.
 */
function pieceOf({ timeScale, deltaT, utcMs, ut1Days }: TimeBasis): string {
  const { input, basis, ut1MinusUtc } = timeScale;
  if (input === "tt") return "";
  const model = deltaT.model === DELTA_T_MODEL ? (ut1Days < MODEL_KNOTS_FROM ? "spline" : "knots") : deltaT.model;
  if (input === "ut1") return `${basis} ${model}`;
  const reading = ut1MinusUtc === null ? "as-ut1" : ut1MinusUtc.source === "fallback" ? "fallback" : taiMinusUtcAt(utcMs);
  return `${basis} ${model} ${reading}`;
}

/**
 * The time that separates two samples taken `days` apart on an input's scale,
 * in days: `days` itself where both lie in one piece of the time basis, and
 * the TT between them where a step of the basis lies between them (a leap
 * second, a change of basis), which `days` would miscount.
 */
export function elapsedDays(before: TimeBasis, after: TimeBasis, days: number): number {
  return pieceOf(before) === pieceOf(after) ? days : after.ttDays - before.ttDays;
}
