/**
 * ΔT = TT − UT1 in seconds, with a 1-σ band: the model "zodiacs-deltat/1".
 *
 * The argument is astronomy-engine's `ut`, days since 2000-01-01T12:00Z, with
 * the instant read as UT1 (UTC is taken as UT1; UT1 − UTC and leap seconds
 * belong to the time-scale work, M3). Years are y = 2000 + ut / 365.25, so
 * y = 2027 falls on 2027-01-01T06:00Z.
 *
 * - y < −720, "long-term": the integral of Stephenson, Morrison & Hohenkerk
 *   2016 (SMH, Proc. R. Soc. A 472: 20160404, CC BY 4.0), eq. (5.1),
 *   lod = 1.78t − 4.0 sin(2πt/15) ms with t in centuries from 1825, joined in
 *   value at −720.
 * - −720 ≤ y < 1941, "reconstructed": SMH's Table S15 as the C2 cubic spline
 *   through its knots from −720 to 1945, rebuilt on first use. Their lunar
 *   tidal acceleration, −25.82″/cy², is kept: no tidal term is applied.
 * - 1941 ≤ y < 1956, "reconstructed": whole-year knots from USNO's
 *   historic_deltat.data.
 * - 1956 ≤ y ≤ the last observed day, "observed": whole-year knots from USNO
 *   to 1961, IERS 20 C04 to 1972 and IERS finals2000A (rows flagged I) after,
 *   then a knot at the last observed day. Linear between knots.
 * - To the last predicted day, "predicted": four evenly spaced knots from
 *   Bulletin A's predictions (finals2000A rows flagged P).
 * - After it, "extrapolated": the prediction window's slope, damped with
 *   τ = 15 years, plus the curvature of the long-term curve.
 *
 * σ: after the last observed day it depends only on h, the years since that
 * day: 0.03 + 0.09·h^0.75 up to one year, 0.12·h^1.5 up to ten, then 0.61 s a
 * year more; continuous and never decreasing. Observed: 0.03. Before 1956 it
 * is a band built from measured indicators, and before 1620 an estimate, not
 * a calibrated 1-σ. Sources, licences and every number:
 * docs/platform/evidence/deltat-2026-09-25/ in the Zodiacs site repository.
 */

export type DeltaTSegment =
  | "long-term"
  | "reconstructed"
  | "observed"
  | "predicted"
  | "extrapolated"
  | "pinned";

/** ΔT with its band and provenance. A caller's pin has sigma, table and tableDigest null. */
export interface DeltaT {
  seconds: number;
  /** 1-σ band in seconds; null for a pin. */
  sigma: number | null;
  model: "zodiacs-deltat/1" | "pinned";
  /** Date of the last observed IERS day behind the table; null for a pin. */
  table: string | null;
  /** DELTA_T_TABLE.digest; null for a pin. */
  tableDigest: string | null;
  segment: DeltaTSegment;
}

/** The part of the model refreshed from IERS. It changes only with an engine release. */
export interface DeltaTTable {
  /** Date of the last observed IERS day (YYYY-MM-DD). */
  readonly version: string;
  /** First 16 hex digits of SHA-256 over the JSON text [from, observedTo, predictedTo, ...knots]. */
  readonly digest: string;
  /** Year of the first whole-year knot. */
  readonly from: number;
  /** MJD of the last observed day. */
  readonly observedTo: number;
  /** MJD of the last predicted day. */
  readonly predictedTo: number;
  /**
   * Knots in 0.01 s, the first absolute and the rest differences: every whole
   * year from `from` before observedTo, then observedTo, then four evenly
   * spaced up to predictedTo.
   */
  readonly knots: readonly number[];
}

export const DELTA_T_MODEL = "zodiacs-deltat/1";

/** This release's table: IERS files of 2026-09-24. Frozen. */
export const DELTA_T_TABLE: DeltaTTable = Object.freeze({
  version: "2026-09-24",
  digest: "6371988c510a1c6c",
  from: 1941,
  observedTo: 61307,
  predictedTo: 61680,
  knots: Object.freeze([
    2482, 48, 47, 50, 49, 51, 50, 48, 45, 45, 42, 40, 39, 36, 35, 28, 33, 49, 50, 48, 43, 42, 47, 56, 71, 80,
    89, 87, 90, 98, 99, 106, 114, 111, 100, 98, 106, 101, 106, 95, 84, 79, 79, 83, 55, 53, 45, 50, 48, 56,
    71, 74, 81, 86, 81, 84, 66, 68, 50, 36, 26, 21, 17, 10, 12, 16, 30, 31, 32, 29, 25, 28, 31, 37, 36, 46,
    49, 38, 25, 14, 0, -7, -9, -2, -4, -3, 9, 10, 7, 1, -5
  ])
});

// SMH 2016 Table S15: knot years (then every 5 years from 1850 to 1945), values
// at the knots in 0.01 s, and second derivatives at −720 and 1945 in s/yr².
const SX = [-720, 400, 1000, 1500, 1600, 1650, 1720, 1800, 1810, 1820, 1830, 1840];
const SY = [
  2055059, 660440, 146765, 29264, 8938, 4374, 1073, 1871, 1526, 1668, 1076, 767, 932, 1038, 904, 826, 237,
  -113, -321, -439, -388, -502, -198, 492, 1114, 1748, 2162, 2379, 2442, 2416, 2443, 2705
];

// σ before 1956 in seconds, [year, σ] pairs, linear between; before 1620 at least 0.6·t².
const SIG = [
  640, 83, 900, 230, 1240, 120, 1400, 15, 1420, 7.5, 1440, 4.2, 1500, 5.6, 1560, 27, 1670, 15, 1710, 3.3,
  1720, 3.3, 1760, 1.5, 1800, 1.5, 1810, 0.55, 1820, 0.55, 1840, 0.46, 1956, 0.46
];

// Built on first use: the spline's knots (X, Y) and second derivatives (M),
// the knots from the table (KX years, KV seconds), the last observed and last
// predicted years, and the prediction window's slope in s/yr.
let X: number[] | undefined;
let Y: number[];
let M: number[];
let KX: number[];
let KV: number[];
let OBS: number;
let PRED: number;
let SLOPE: number;

const yearOfMjd = (mjd: number): number => 2000 + (mjd - 51544.5) / 365.25;

// SMH eq. (5.1) integrated: ΔT in s (to a constant), and its rate in s/yr.
const longTerm = (y: number): number => {
  const t = (y - 1825) / 100;
  return 36.525 * (0.89 * t * t + (30 / Math.PI) * Math.cos((Math.PI * t) / 7.5));
};
const longTermRate = (y: number): number => {
  const t = (y - 1825) / 100;
  return 0.36525 * (1.78 * t - 4 * Math.sin((Math.PI * t) / 7.5));
};

function init(): void {
  const x = SX.slice();
  for (let year = 1850; year <= 1945; year += 5) x.push(year);
  const y = SY.map((v) => v / 100);
  // Second derivatives of the C2 spline with both end values given (Thomas algorithm).
  const n = x.length - 1;
  const m = [0.018915];
  const c = [0];
  const r = [0.018915];
  for (let i = 1; i < n; i++) {
    const a = x[i]! - x[i - 1]!;
    const b = x[i + 1]! - x[i]!;
    const p = 2 * (a + b) - a * c[i - 1]!;
    c[i] = b / p;
    r[i] = (6 * ((y[i + 1]! - y[i]!) / b - (y[i]! - y[i - 1]!) / a) - a * r[i - 1]!) / p;
  }
  m[n] = -0.09856;
  for (let i = n - 1; i > 0; i--) m[i] = r[i]! - c[i]! * m[i + 1]!;

  const T = DELTA_T_TABLE;
  const obs = yearOfMjd(T.observedTo);
  const pred = yearOfMjd(T.predictedTo);
  const kv: number[] = [];
  let total = 0;
  for (const step of T.knots) kv.push((total += step) / 100);
  const years = kv.length - 5;
  const kx: number[] = [];
  for (let i = 0; i < years; i++) kx.push(T.from + i);
  for (let k = 0; k < 5; k++) kx.push(obs + (k * (pred - obs)) / 4);
  X = x;
  Y = y;
  M = m;
  KX = kx;
  KV = kv;
  OBS = obs;
  PRED = pred;
  SLOPE = (kv[years + 4]! - kv[years]!) / (pred - obs);
}

// Callers run init() first.
function seconds(t: number): number {
  const x = X!;
  const y = Y;
  const m = M;
  const kx = KX;
  const kv = KV;
  if (t < -720) return y[0]! + longTerm(t) - longTerm(-720);
  if (t < 1941) {
    let i = x.length - 2;
    while (t < x[i]!) i--;
    const h = x[i + 1]! - x[i]!;
    const a = x[i + 1]! - t;
    const b = t - x[i]!;
    return (
      (m[i]! * a ** 3 + m[i + 1]! * b ** 3) / (6 * h) +
      (y[i]! / h - (m[i]! * h) / 6) * a +
      (y[i + 1]! / h - (m[i + 1]! * h) / 6) * b
    );
  }
  const n = kx.length - 1;
  if (t <= kx[n]!) {
    const i =
      t < OBS ? Math.floor(t - 1941) : n - 4 + Math.min(3, Math.floor((4 * (t - OBS)) / (PRED - OBS)));
    return kv[i]! + ((t - kx[i]!) * (kv[i + 1]! - kv[i]!)) / (kx[i + 1]! - kx[i]!);
  }
  const g = t - PRED;
  return kv[n]! + SLOPE * 15 * (1 - Math.exp(-g / 15)) + longTerm(t) - longTerm(PRED) - longTermRate(PRED) * g;
}

function sigma(t: number): number {
  const h = t - OBS;
  if (h > 0) return h <= 1 ? 0.03 + 0.09 * h ** 0.75 : h <= 10 ? 0.12 * h ** 1.5 : 0.61 * h - 2.3052668;
  if (t >= 1956) return 0.03;
  const c = (t - 1825) / 100;
  let v = t < 1620 ? 0.6 * c * c : 0;
  if (t >= 640) {
    let i = 0;
    while (t >= SIG[i + 2]!) i += 2;
    v = Math.max(v, SIG[i + 1]! + ((t - SIG[i]!) * (SIG[i + 3]! - SIG[i + 1]!)) / (SIG[i + 2]! - SIG[i]!));
  }
  return v;
}

/** ΔT at astronomy-engine's UT (days since J2000.0), with its band and the part of the model that answered. */
export function deltaTAt(ut: number): DeltaT {
  const t = 2000 + ut / 365.25;
  if (!X) init();
  return {
    seconds: seconds(t),
    sigma: sigma(t),
    model: DELTA_T_MODEL,
    table: DELTA_T_TABLE.version,
    tableDigest: DELTA_T_TABLE.digest,
    segment:
      t < -720
        ? "long-term"
        : t < 1956
          ? "reconstructed"
          : t <= OBS
            ? "observed"
            : t <= PRED
              ? "predicted"
              : "extrapolated"
  };
}

/** For astronomy-engine's SetDeltaTFunction: UT days in, seconds out. Allocation-free. */
export function deltaT(ut: number): number {
  if (!X) init();
  return seconds(2000 + ut / 365.25);
}
