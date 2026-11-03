/**
 * The birth-time sensitivity of the varga signs: for each point and varga, the
 * first millisecond before and after the birth at which the point's varga sign
 * changes, on the chart's own clock and in the engine's own arithmetic
 * (docs/vedic.md, *Birth-time sensitivity*). The checks are preregistered in
 * docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/.
 */
import { GeoMoon, GeoVector } from "astronomy-engine";
import type { Body } from "astronomy-engine";

import { resolvedChart } from "../api.js";
import { gastHours, onChartClock } from "../ephemeris.js";
import { eclipticOfDate } from "../frame.js";
import { computeAngles } from "../houses.js";
import { tilt } from "../nutation.js";
import { meanNodeLongitude } from "../points.js";
import { readOptions } from "../read-options.js";
import { normalizeLongitude } from "../signs.js";
import { timeBasis } from "../time-scale.js";
import type { TimeScale, TimeScaleName } from "../time-scale.js";
import type { BirthInput, Chart, ChartFlag, ZodiacSign } from "../types.js";
import { ayanamsaAt, definitionOf } from "./ayanamsa.js";
import type { AyanamsaDefinition, AyanamsaName } from "./ayanamsa.js";
import { ticksOf } from "./grid.js";
import { siderealChartOf, wrap360 } from "./sidereal.js";
import { VARGAS, changeBoundaries, vargaAtTick } from "./varga.js";
import type { VargaName, VargaPosition, VargaScheme } from "./varga.js";

/**
 * A point whose varga signs vargaSensitivity follows. "Mean Node" and "Mean
 * South Node" are chartPoints' mean nodes; siderealChart's North and South
 * Node are the true node, which is not offered.
 */
export type VargaPoint =
  | "Ascendant" | "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter"
  | "Saturn" | "Uranus" | "Neptune" | "Pluto" | "Mean Node" | "Mean South Node";

/** The points vargaSensitivity can search, in the order of its rows. */
export const VARGA_POINTS: readonly VargaPoint[] = /*#__PURE__*/ Object.freeze([
  "Ascendant", "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "Mean Node", "Mean South Node"
] as const);

/** vargaSensitivity's options. A key not named here is refused with a RangeError. */
export interface VargaSensitivityOptions {
  /** Distinct VARGA_POINTS; default the Ascendant, the Sun to Saturn and the two mean nodes. */
  readonly points?: readonly VargaPoint[] | undefined;
  /** Distinct vargas of the sixteen; default all. */
  readonly vargas?: readonly VargaName[] | undefined;
  /** Also the cyclic D2 and D3, for whichever of the two is asked for; default false. */
  readonly cyclic?: boolean | undefined;
  /** Whole minutes searched on each side of the birth, 1 to 2,880; default 1,440. */
  readonly horizonMinutes?: number | undefined;
}

/** A change of a row's varga sign. */
export interface VargaChange {
  /** The first millisecond with the new sign, ISO 8601 on the chart's input scale, named as ChartInput.utc is. */
  readonly at: string;
  /** (at − birth) / 60,000: zero or negative for `previous`, positive for `next`. */
  readonly minutes: number;
  /** The change boundary crossed, degrees: the double nearest T / 7560 for a whole tick T. */
  readonly boundary: number;
  /** The sign at at − 1 ms. */
  readonly from: ZodiacSign;
  /** The sign at at. */
  readonly to: ZodiacSign;
}

/** Why a row was not computed. A minor release may add a reason. */
export type VargaRefusalReason = "no-angles" | "polar" | "out-of-range" | "rate-bound" | "evaluation-budget";

export interface VargaRefusal {
  readonly status: "refused";
  readonly reason: VargaRefusalReason;
  readonly detail: string;
}

/** One point in one varga: its sign at the birth, and the changes on either side. */
export interface VargaSensitivityRow {
  readonly point: VargaPoint;
  readonly varga: VargaName;
  readonly scheme: VargaScheme;
  /** vargaOf at the birth instant; null when the row was refused before the point was evaluated. */
  readonly position: VargaPosition | null;
  /** The change into the birth sign: the sign holds from `previous.at` to the birth; null if none in `searched`. */
  readonly previous: VargaChange | null;
  /** The first change after the birth; null if none in `searched`. */
  readonly next: VargaChange | null;
  /** What "none missed" rests on: "derived" bounds (the Ascendant, the mean nodes) or "scanned" ones (the bodies). */
  readonly completeness: "derived" | "scanned";
  /** Set when the row was not computed; `previous` and `next` are then null and say nothing. */
  readonly refusal: VargaRefusal | null;
}

/** vargaSensitivity's result, frozen. */
export interface VargaSensitivity {
  /** The ayanamsa's name. */
  readonly ayanamsa: string;
  /** The birth instant as given, ISO 8601 on its input scale. */
  readonly utc: string;
  /** How the birth instant became UT1 and TT, as a chart's `timeScale`. */
  readonly timeScale: TimeScale;
  readonly horizonMinutes: number;
  /**
   * The span searched, ISO 8601 on the input scale: the horizon, cut where an
   * instant's UT1 or TT would leave REFERENCE_SPAN; the birth instant alone when
   * every row is refused with `out-of-range`.
   */
  readonly searched: { readonly from: string; readonly to: string };
  /** What the instants are exact against, and what "none missed" rests on. */
  readonly verification: string;
  /** Point by point in VARGA_POINTS order; within a point, the vargas in VARGAS order, a cyclic row after its Parashari one. */
  readonly rows: readonly VargaSensitivityRow[];
  /** The evaluations of its longitude the call made for each point asked, of the call's budget of 2,000,000. */
  readonly evaluations: Readonly<Partial<Record<VargaPoint, number>>>;
  /** The chart's flags and the ayanamsa's, as siderealChart gives them. */
  readonly flags: readonly ChartFlag[];
}

const DAY = 86_400_000;
const DEG = Math.PI / 180;
/** Ticks of 1/7560° in 360°. */
const CIRCLE = 2_721_600;
const J2000 = Date.UTC(2000, 0, 1, 12);
const SPAN_FROM = Date.UTC(1800, 0, 1);
const SPAN_TO = Date.UTC(2200, 0, 1);
/** UT1 days from J2000 at which the ΔT model hands over from its spline to its knots, 1941.0 (src/time-scale.ts). */
const KNOTS = (1941 - 2000) * 365.25;
/** The evaluations of a point's longitude one call may make (the preregistration's INPUTS.md, section 6). */
export const VARGA_BUDGET = 2_000_000;
/** Rounding allowed in a monotone point's advance over a bracket, degrees. */
const SLACK = 1e-9;
/** The mean node's rate, degrees a day: the leading term of its polynomial, 6,962,890.5431″ a Julian century (src/points.ts). */
const NODE_RATE = 6_962_890.5431 / 3600 / 36_525;

/**
 * Upper bounds on each body's longitude rate, degrees a day: twice the largest
 * rate the engine's own positions reach from 1800 to 2200, scanned. A copy of
 * WINDOW_RATE_BOUNDS (src/window.ts), so that this entry does not load the
 * window search; a test holds it to the source.
 */
export const BODY_RATE_BOUNDS = /*#__PURE__*/ Object.freeze({
  Sun: 2.1, Moon: 31, Mercury: 4.5, Venus: 2.6, Mars: 1.6, Jupiter: 0.49, Saturn: 0.27, Uranus: 0.13,
  Neptune: 0.077, Pluto: 0.082
});

const DETAILS = /*#__PURE__*/ Object.freeze({
  "no-angles": "The chart has no angles: its time is not known, or it has no place.",
  polar: "The latitude is more than 66° from the equator, where the Ascendant's rate bounds no longer hold.",
  "out-of-range": "The birth instant's UT1 or TT lies outside REFERENCE_SPAN, 1800 to 2200.",
  "rate-bound": "The point moved as its rate bound says it cannot, so no change can be said to be the first.",
  "evaluation-budget": "The call spent its 2,000,000 evaluations before this point's search was done."
});

const VERIFICATION =
  "exact to the millisecond in the engine's own positions on the chart's clock; none missed by derived bounds " +
  "for the Ascendant and the mean nodes, by scanned bounds for the bodies";

/** The clock and place a chart is read on, and the ayanamsa its sidereal longitudes take. */
export interface Sky {
  readonly scale: TimeScaleName;
  readonly pin: number | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly definition: AyanamsaDefinition;
}

/**
 * Internal: a point's sidereal longitude at a millisecond on the chart's clock,
 * computed as the public API computes it for a chart at that instant with the
 * same place and clock: siderealChart's ascendant and bodies, and
 * siderealLongitude of chartPoints' mean nodes with the chart's ayanamsaValue.
 */
export function siderealAt(point: VargaPoint, ms: number, sky: Sky): number {
  return onChartClock(ms, sky.scale, sky.pin, (time) => {
    let lon: number;
    if (point === "Ascendant") {
      lon = computeAngles({
        gastHours: gastHours(time), latitude: sky.latitude!, longitude: sky.longitude!, obliquity: tilt(time.tt).tobl
      }).asc;
    } else if (point.startsWith("Mean")) {
      const node = meanNodeLongitude(time.tt / 36525, tilt(time.tt).dpsi / 3600);
      lon = normalizeLongitude(point === "Mean Node" ? node : node + 180);
    } else {
      const vector = point === "Moon" ? GeoMoon(time) : GeoVector(point as unknown as Body, time, true);
      lon = eclipticOfDate(vector.x, vector.y, vector.z, time.tt).lon;
    }
    return wrap360(wrap360(lon) - ayanamsaAt(sky.definition, time).true);
  });
}

/** Thrown by a kept longitude when the call's evaluations are spent. */
class Spent {}

/**
 * Internal: `lon`, keeping each value it computes for the call and spending one
 * of the budget's evaluations on each new one.
 */
export function kept(lon: (ms: number) => number, budget: { left: number }): (ms: number) => number {
  const values = new Map<number, number>();
  return (ms) => {
    let value = values.get(ms);
    if (value === undefined) {
      if (budget.left < 1) throw new Spent();
      budget.left -= 1;
      value = lon(ms);
      values.set(ms, value);
    }
    return value;
  };
}

/** The first millisecond in (from, to] at which `holds` is true, given that it is false at `from` and true at `to`. */
function firstWhere(holds: (ms: number) => boolean, from: number, to: number): number {
  let low = from;
  let high = to;
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (holds(middle)) high = middle;
    else low = middle;
  }
  return high;
}

const turn = (value: number): number => ((value % 360) + 360) % 360;
/** A difference of longitudes, degrees, in [−180, 180). */
const signed = (value: number): number => turn(value + 180) - 180;

/** A key's run, in ticks: the change boundary it starts on, and the next one round the circle. */
export type Run = readonly [start: number, end: number];
/** A change: its millisecond, and the end of the run it crossed, in ticks. */
export type Found = readonly [at: number, tick: number] | null;

/** Internal: the run of a key's change boundaries that holds the tick `at`. */
export function runOf(boundaries: readonly number[], at: number): Run {
  const next = boundaries.findIndex((t) => t > at);
  const k = next < 0 ? boundaries.length : next;
  return [boundaries[(k - 1 + boundaries.length) % boundaries.length]!, boundaries[k % boundaries.length]!];
}

/**
 * Internal: the seams of the time basis in [lo, hi] on a clock: each
 * millisecond z at which the record's provenance (its basis, its ΔT model and
 * segment, the side of the ΔT model's handover its UT1 lies on, the source of
 * UT1 − UTC and TAI − UTC at its UTC instant) differs from z − 1's, with a
 * neighbourhood of the step there and a second, on each side, to be walked a
 * millisecond at a time. Provenance is probed every hour and bisected.
 */
export function seamWalks(lo: number, hi: number, scale: TimeScaleName, pin: number | undefined): [number, number][] {
  const basis = (ms: number) => timeBasis(ms, scale, pin);
  const label = (ms: number): string => {
    const { timeScale, deltaT, utcMs, ut1Days } = basis(ms);
    return [timeScale.basis, deltaT.model, deltaT.segment, ut1Days < KNOTS, timeScale.ut1MinusUtc?.source,
      timeBasis(utcMs, "utc").timeScale.leapSeconds?.taiMinusUtc].join();
  };
  const walks: [number, number][] = [];
  for (let p = lo; p < hi; p += 3_600_000) {
    const q = Math.min(p + 3_600_000, hi);
    for (let from = p, kind = label(p); kind !== label(q); ) {
      const z = firstWhere((ms) => label(ms) !== kind, from, q);
      const [before, at] = [basis(z - 1), basis(z)];
      const step = Math.max(Math.abs((at.ut1Days - before.ut1Days) * DAY - 1), Math.abs((at.ttDays - before.ttDays) * DAY - 1));
      const width = Math.ceil(step) + 1000;
      walks.push([Math.max(lo, z - width), Math.min(hi, z + width)]);
      from = z;
      kind = label(z);
    }
  }
  return walks;
}

/**
 * Internal: the search core. `x` gives the point's sidereal longitude at a
 * millisecond; `mode` is 1 for a longitude that increases within each piece of
 * the time basis by between `rates[0]` and `rates[1]` degrees a millisecond, −1
 * for one that decreases so, and 0 for one whose rate is at most `rates[1]`
 * either way. `runs` are the birth runs of the keys, `t0` the birth and [lo, hi]
 * the span searched; `walks` are walked a millisecond at a time, and no bracket
 * crosses one. A monotone point is bracketed in steps it cannot turn 330° in,
 * and each change is bisected; a body steps floor(d / bound) milliseconds, d the
 * distance to the nearest end of an open run, and a change must fall on the
 * last millisecond of such a step. Gives each key's previous and next change,
 * or a refusal.
 */
export function searchRuns(
  x: (ms: number) => number,
  mode: -1 | 0 | 1,
  [low, high]: readonly [number, number],
  runs: readonly Run[],
  t0: number,
  lo: number,
  hi: number,
  walks: readonly (readonly [number, number])[]
): [previous: Found[], next: Found[]] | "rate-bound" | "evaluation-budget" {
  const inside = (ms: number, [a, b]: Run): boolean => (ticksOf(x(ms)) - a + CIRCLE) % CIRCLE < (b - a + CIRCLE) % CIRCLE;
  const side = (dir: 1 | -1): Found[] | "rate-bound" => {
    const found: Found[] = runs.map(() => null);
    let open = runs.map((_, k) => k);
    const limit = dir > 0 ? hi : lo;
    for (let t = t0; open.length > 0 && t !== limit; ) {
      const walking = walks.some(([u, v]) => u <= t + dir && t + dir <= v);
      let n = 1;
      let e = t + dir;
      if (!walking) {
        if (mode) n = Math.max(1, Math.floor(330 / high));
        else {
          const here = x(t);
          const d = Math.min(...open.flatMap((k) => runs[k]!.map((end) => Math.abs(signed(end / 7560 - here)))));
          n = Math.max(1, Math.floor(d / high));
        }
        e = t + dir * n;
        if (dir * (e - limit) > 0) e = limit;
        for (const [u, v] of walks) {
          const edge = dir > 0 ? u : v;
          if (dir * (edge - t) > 0 && dir * (e - edge) >= 0) e = edge - dir;
        }
        if (mode) {
          const length = Math.abs(e - t);
          const advance = turn(mode * dir * (x(e) - x(t)) + 30) - 30;
          if (advance < low * length - SLACK || advance > high * length + SLACK) return "rate-bound";
        }
      }
      const leaving = open.filter((k) => !inside(e, runs[k]!));
      for (const k of leaving) {
        const at = dir > 0
          ? firstWhere((ms) => !inside(ms, runs[k]!), t, e)
          : firstWhere((ms) => inside(ms, runs[k]!), e, t);
        if (!walking && !mode && (Math.abs(e - t) !== n || at !== (dir > 0 ? e : e + 1))) return "rate-bound";
        const rising = signed(x(at) - x(at - 1)) > 0;
        found[k] = [at, rising === dir > 0 ? runs[k]![1] : runs[k]![0]];
      }
      open = open.filter((k) => !leaving.includes(k));
      t = e;
    }
    return found;
  };
  try {
    const next = side(1);
    if (typeof next === "string") return next;
    const previous = side(-1);
    return typeof previous === "string" ? previous : [previous, next];
  } catch (thrown) {
    if (thrown instanceof Spent) return "evaluation-budget";
    throw thrown;
  }
}

function subset<T extends string>(value: unknown, all: readonly T[], label: string): readonly T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item, k) => !all.includes(item as T) || value.indexOf(item) !== k)) {
    throw new RangeError(`options.${label} must be an array of distinct names from: ${all.join(", ")}.`);
  }
  return all.filter((item) => value.includes(item));
}

/**
 * The first millisecond before and after the birth at which each point's varga
 * sign changes, in the engine's own arithmetic on the chart's clock (its input
 * scale and any pinned ΔT), within `horizonMinutes` on each side. The birth is
 * read as siderealChart reads it; a supplied Chart gives the instant, the place
 * and the clock, and every position is computed again from them. Each change is
 * the first millisecond at which the point's sidereal longitude, as
 * siderealChart (for the mean nodes, chartPoints with the chart's
 * ayanamsaValue) gives it, lies outside the varga run holding it at the birth:
 * a run is the arc between two boundaries at which the sign changes, so a run
 * can span a sign start.
 *
 * Malformed input throws RangeError: an option key not named, an unknown or
 * repeated point or varga, a horizon that is not a whole number of minutes from
 * 1 to 2,880, and whatever siderealChart refuses. What cannot be computed is
 * a refusal on the rows it touches: `no-angles` and `polar` (beyond 66°) for the
 * Ascendant, `out-of-range` for every row when the birth's UT1 or TT lies
 * outside REFERENCE_SPAN, `rate-bound` for a point that moved as its bound says
 * it cannot, and `evaluation-budget` for the point in progress and those after
 * it once the call has made 2,000,000 evaluations. See docs/vedic.md.
 */
export function vargaSensitivity(
  natal: Chart | BirthInput,
  ayanamsa: AyanamsaName | AyanamsaDefinition,
  options?: VargaSensitivityOptions
): VargaSensitivity {
  const read = readOptions(options, ["points", "vargas", "cyclic", "horizonMinutes"], "vargaSensitivity options");
  const points = subset(read.points, VARGA_POINTS, "points") ?? VARGA_POINTS.filter((_, k) => k < 8 || k > 10);
  const names = VARGAS.map((varga) => varga.name);
  const vargas = subset(read.vargas, names, "vargas") ?? names;
  const cyclic = read.cyclic ?? false;
  if (typeof cyclic !== "boolean") throw new RangeError("options.cyclic must be true or false.");
  const minutes = read.horizonMinutes ?? 1440;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > 2880) {
    throw new RangeError("options.horizonMinutes must be a whole number of minutes from 1 to 2,880.");
  }
  const keys = vargas.flatMap((varga): [VargaName, VargaScheme][] =>
    cyclic && (varga === "D2" || varga === "D3") ? [[varga, "parashari"], [varga, "cyclic"]] : [[varga, "parashari"]]);
  const definition = definitionOf(ayanamsa);
  const chart = resolvedChart(natal).chart;
  const sidereal = siderealChartOf(chart, definition);
  const { utc, timeScale, deltaT: pin, latitude, longitude } = chart.input;
  const sky: Sky = { scale: timeScale ?? "utc", pin, latitude, longitude, definition };
  const t0 = utc.getTime();
  const inSpan = (ms: number): boolean => {
    const { ut1Days, ttDays } = timeBasis(ms, sky.scale, pin);
    return [ut1Days, ttDays].every((days) => J2000 + days * DAY >= SPAN_FROM && J2000 + days * DAY < SPAN_TO);
  };
  const reach = minutes * 60_000;
  const known = inSpan(t0);
  let lo = t0;
  let hi = t0;
  if (known) {
    lo = inSpan(t0 - reach) ? t0 - reach : firstWhere(inSpan, t0 - reach, t0);
    hi = inSpan(t0 + reach) ? t0 + reach : firstWhere((ms) => !inSpan(ms), t0, t0 + reach) - 1;
  }
  const walks = known ? seamWalks(lo, hi, sky.scale, pin) : [];
  // The ayanamsa's rate bound, degrees a day. 0.0003 bounds its precession and
  // the nutation in longitude; a linear definition adds its rate. A star
  // definition adds 0.021, the most the Sun's light deflection can move the
  // star's place in a day as src/vedic/ayanamsa.ts computes it: by at most
  // (2GM/c²) / r / f per radian the Sun moves, f = 1e-6 / max(r², 1) the floor
  // of 1 − cos E (r the Earth's distance from the Sun, 0.98 au or more; E the
  // star's angle from the Sun), so 0.02015, and the Sun moves at most 1.0194° a
  // day.
  const a = 0.0003 + (definition.kind === "linear" ? Math.abs(definition.rate) / 3600 / 365.25 : definition.kind === "star" ? 0.021 : 0);
  const budget = { left: VARGA_BUDGET };
  let spent = false;
  const rows: VargaSensitivityRow[] = [];
  const evaluations: Partial<Record<VargaPoint, number>> = {};
  for (const point of points) {
    const left = budget.left;
    const derived = point === "Ascendant" || point.startsWith("Mean");
    const x = kept((ms) => siderealAt(point, ms, sky), budget);
    let reason: VargaRefusalReason | null = !known ? "out-of-range" : spent ? "evaluation-budget"
      : point !== "Ascendant" ? null : chart.angles === null ? "no-angles" : Math.abs(latitude!) > 66 ? "polar" : null;
    let birth: number | null = null;
    let sides: [Found[], Found[]] | null = null;
    if (reason === null) {
      try {
        birth = x(t0);
      } catch (thrown) {
        if (!(thrown instanceof Spent)) throw thrown;
        reason = "evaluation-budget";
      }
    }
    if (birth !== null) {
      let rates: [number, number];
      if (point === "Ascendant") {
        const phi = Math.abs(latitude!) * DEG;
        const tilted = Math.cos(phi + 23.5 * DEG);
        rates = [
          0.99 * 360.9856 * Math.sqrt(Math.cos(phi) ** 2 - Math.sin(23.5 * DEG) ** 2) - 5e-5 / tilted - a,
          (1.01 * 360.9856 * Math.cos(phi)) / tilted + a
        ];
      } else if (derived) rates = [NODE_RATE * (1 - 1e-5) - a, NODE_RATE * (1 + 1e-5) + a];
      else rates = [0, BODY_RATE_BOUNDS[point as keyof typeof BODY_RATE_BOUNDS] + a];
      const tick = ticksOf(birth);
      const runs = keys.map(([varga, scheme]) => runOf(changeBoundaries(varga, scheme), tick));
      const result = searchRuns(x, !derived ? 0 : point === "Ascendant" ? 1 : -1,
        [rates[0] / DAY, rates[1] / DAY], runs, t0, lo, hi, walks);
      if (typeof result === "string") reason = result;
      else sides = result;
    }
    if (reason === "evaluation-budget") spent = true;
    evaluations[point] = left - budget.left;
    keys.forEach(([varga, scheme], k) => {
      const change = (found: Found): VargaChange | null => found && Object.freeze({
        at: new Date(found[0]).toISOString(),
        minutes: (found[0] - t0) / 60_000,
        boundary: found[1] / 7560,
        from: vargaAtTick(ticksOf(x(found[0] - 1)), varga, scheme).sign,
        to: vargaAtTick(ticksOf(x(found[0])), varga, scheme).sign
      });
      rows.push(Object.freeze({
        point,
        varga,
        scheme,
        position: birth === null ? null : vargaAtTick(ticksOf(birth), varga, scheme),
        previous: sides && change(sides[0][k] ?? null),
        next: sides && change(sides[1][k] ?? null),
        completeness: derived ? "derived" : "scanned",
        refusal: reason && Object.freeze({ status: "refused", reason, detail: DETAILS[reason] })
      }));
    });
  }
  return Object.freeze({
    ayanamsa: definition.name,
    utc: utc.toISOString(),
    timeScale: sidereal.ayanamsaValue.timeScale,
    horizonMinutes: minutes,
    searched: Object.freeze({ from: new Date(lo).toISOString(), to: new Date(hi).toISOString() }),
    verification: VERIFICATION,
    rows: Object.freeze(rows),
    evaluations: Object.freeze(evaluations),
    flags: sidereal.flags
  });
}
