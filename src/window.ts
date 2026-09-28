/**
 * Birth-time windows: the partition of a window of possible birth instants
 * into cells within which every discrete feature of the chart is constant.
 *
 * This entry point carries the engine's ephemeris, like the root entry point,
 * and is separate from it so that the root entry point does not grow.
 */
import { MakeTime, SetDeltaTFunction, SiderealTime, e_tilt } from "astronomy-engine";

import { ASPECTS, ASPECT_TYPES, matchAspect, separation } from "./aspects.js";
import { validateBirthSettings } from "./birth-input.js";
import { dateFrom } from "./date-input.js";
import { deltaT } from "./deltat.js";
import { bodyLongitude } from "./ephemeris.js";
import { computeAngles, computeHouses, houseOf, isPolarUndefinedHouseSystem } from "./houses.js";
import type { AngleInput } from "./houses.js";
import { outsideReferenceSpan } from "./reference-span.js";
import { SIGN_NAMES, normalizeLongitude, signIndexForLongitude } from "./signs.js";
import type {
  AspectType,
  BodyName,
  DateInput,
  HouseNumber,
  HouseSystem,
  ZodiacSign
} from "./types.js";
import { ENGINE_VERSION } from "./types.js";
import {
  advance,
  hull,
  morinusRange,
  obliqueRange,
  reaches,
  shift,
  signedDelta,
  sinRange,
  wrap360
} from "./window-ranges.js";
import type { Range } from "./window-ranges.js";

const DAY = 86_400_000;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const J2000 = Date.UTC(2000, 0, 1, 12);

/** How far this release's switch instants have been checked. */
export const WINDOW_VERIFICATION = "sampled at one-second resolution";

/** The longest window accepted: 48 hours, in milliseconds. */
export const MAX_WINDOW_MS = 172_800_000;

/**
 * Upper bounds on each body's longitude rate, degrees per day: twice the
 * largest rate the engine's own positions reach from 1800 to 2200, scanned
 * every hour for the Moon and the nodes, every three hours for Mercury, Venus
 * and Mars, every six for the Sun and daily for the rest.
 */
export const WINDOW_RATE_BOUNDS: Readonly<Record<BodyName, number>> = Object.freeze({
  Sun: 2.1,
  Moon: 31,
  Mercury: 4.5,
  Venus: 2.6,
  Mars: 1.6,
  Jupiter: 0.49,
  Saturn: 0.27,
  Uranus: 0.13,
  Neptune: 0.077,
  Pluto: 0.082,
  "North Node": 0.53,
  "South Node": 0.53
});

/**
 * Bound on the true node's evaluation jitter, degrees, T Julian centuries
 * from J2000: 5e-5 (1 + |T|). The engine's true node comes from a velocity
 * astronomy-engine takes by differencing the Moon's position over 1.728 s, so
 * from one millisecond to the next it departs from its smooth motion (at most
 * 0.26°/day) by up to 3.3e-5° from 1800 to 2200 and 4.3e-5° from 1700 to 2300;
 * the bound is at least 3.9 times every value scanned.
 */
function nodeJitter(utcMilliseconds: number): number {
  return 5e-5 * (1 + Math.abs((utcMilliseconds - J2000) / (36525 * DAY)));
}

/** |dε/dt| bound, degrees/day: 2.4 times the largest the engine's obliquity reaches from 1800 to 2200. */
const OBLIQUITY_RATE = 5e-5;
/** Sidereal rate of the RAMC, degrees/day, for checking that its advance is unwrapped correctly. */
const SIDEREAL_RATE = 360.98562;
/** Angles and cusps are enclosed over at most 45° of sidereal rotation. */
const MAX_ANGLE_MS = Math.floor((45 / SIDEREAL_RATE) * DAY);
/** Rounding band around every threshold, degrees. */
const BAND = 1e-9;
/** Instants the search may evaluate before it gives up. */
const MAX_EVALUATIONS = 2_000_000;

const BODIES = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
  "North Node",
  "South Node"
] as const satisfies readonly BodyName[];
const NORTH = 10;
const SOUTH = 11;
const RATES = BODIES.map((body) => WINDOW_RATE_BOUNDS[body]);

/** Aspect pairs in natalChart's order: the first ten bodies, earlier body first. */
const PAIRS: (readonly [number, number])[] = [];
for (let first = 0; first < 10; first += 1) {
  for (let second = first + 1; second < 10; second += 1) PAIRS.push([first, second]);
}
/** Separations in (0°, 180°) at which one of natalChart's aspects enters or leaves orb. */
const orbEdges = (luminary: boolean) =>
  ASPECTS.flatMap(({ angle, orb, luminaryOrb }) => {
    const width = luminary ? luminaryOrb : orb;
    return [angle - width, angle + width].filter((edge) => edge > 0 && edge < 180);
  });
const ORB_EDGES = orbEdges(false);
const LUMINARY_ORB_EDGES = orbEdges(true);

// Component ids: body signs, the two angle signs, body houses, aspect pairs,
// and the house system actually used.
const ASC = 12;
const MC = 13;
const HOUSE = 14;
const ASPECT = 26;
const SYSTEM = ASPECT + PAIRS.length;

/** A rounding model: the true instant is uniform over the rounding unit of the record. */
export interface WindowRounding {
  /** The recorded time, resolved to an instant. */
  recorded: DateInput;
  /** The rounding unit, in minutes. */
  minutes: number;
  /**
   * "nearest" (the default): the record is the nearest multiple of the unit,
   * so the true instant lies within half a unit of it. "down": the record is
   * the start of its unit, as a clock read without rounding up.
   */
  mode?: "nearest" | "down";
}

/**
 * A window of possible birth instants, resolved by the caller, and a place.
 * Give `start` and `end`, or `at` and `minutes` for [at − minutes, at +
 * minutes), or only `rounding`, whose unit is then the window.
 */
export interface BirthWindowInput {
  /** The first instant of the window. */
  start?: DateInput;
  /** The end of the window, which it does not include. */
  end?: DateInput;
  at?: DateInput;
  /** Minutes either side of `at`, to the nearest millisecond. */
  minutes?: number;
  latitude: number;
  longitude: number;
  /** Defaults to "whole", as for natalChart. */
  houseSystem?: HouseSystem;
  /** A second prior for the cells' shares; its unit must lie inside the window. */
  rounding?: WindowRounding;
}

export interface WindowAspect {
  a: BodyName;
  b: BodyName;
  type: AspectType;
}

/** The discrete features of the chart, as natalChart would give them, throughout a cell. */
export interface WindowFeatures {
  signs: Record<BodyName, ZodiacSign>;
  ascendant: ZodiacSign;
  midheaven: ZodiacSign;
  /** Each body's house, as houseOf gives it from the chart's cusps. */
  houses: Record<BodyName, HouseNumber>;
  /** The aspects in orb, in natalChart's pair order. */
  aspects: WindowAspect[];
  /** The house system used: the requested one, or "whole" where Placidus or Koch falls back. */
  houseSystem: HouseSystem;
}

export interface BirthWindowCell {
  /** First instant of the cell. */
  start: Date;
  /** End of the cell, which it does not include. */
  end: Date;
  milliseconds: number;
  /** Share of the window under a uniform prior. */
  share: number;
  /** Share under the rounding model, when one was given. */
  roundedShare?: number;
  features: WindowFeatures;
}

export type WindowChange =
  | { feature: "sign"; body: BodyName; from: ZodiacSign; to: ZodiacSign }
  | { feature: "ascendant" | "midheaven"; from: ZodiacSign; to: ZodiacSign }
  | { feature: "house"; body: BodyName; from: HouseNumber; to: HouseNumber }
  | { feature: "aspect"; a: BodyName; b: BodyName; from: AspectType | null; to: AspectType | null }
  | { feature: "house-system"; from: HouseSystem; to: HouseSystem };

export interface BirthWindowSwitch {
  /**
   * The first millisecond with the new features: the engine's value at the
   * millisecond before differs, so the crossing lies in (at − 1 ms, at].
   */
  at: Date;
  changes: WindowChange[];
}

export type BirthWindowFlag =
  | "polar-fallback"
  | "outside-reference-span"
  /** A rate or enclosure check failed somewhere; completeness is then not established. */
  | "bound-exceeded";

export interface BirthWindow {
  schema: "zodiacs.birth-window.v1";
  /** How far the switch instants have been checked: dense one-second sampling, not proof. */
  verification: typeof WINDOW_VERIFICATION;
  start: Date;
  end: Date;
  latitude: number;
  longitude: number;
  /** The requested house system. */
  houseSystem: HouseSystem;
  rounding: { recorded: Date; minutes: number; mode: "nearest" | "down"; start: Date; end: Date } | null;
  /** Cells in time order; they tile [start, end). */
  cells: BirthWindowCell[];
  /** Switches in time order, one per cell boundary. */
  switches: BirthWindowSwitch[];
  flags: BirthWindowFlag[];
  engineVersion: string;
}

interface AngleState {
  ramc: number;
  obliquity: number;
  asc: number;
  mc: number;
  cusps: number[];
  fellBack: boolean;
}

interface Instant {
  lon: Float64Array;
  angles: AngleState | undefined;
}

interface AngleContext {
  theta1: number;
  theta2: number;
  c: number;
  s: number;
  dEps: number;
  mc: Range;
  raw: Range;
  /** The raw ascendant minus the midheaven; null while it may reach 0° or 180°. */
  gap: Range;
  turned: boolean | null;
  asc: Range;
}

/**
 * astronomy-engine reuses its last nutation for any instant within 1e-6 day
 * (86.4 ms) and its last sidereal time for the same instant. Moving both to a
 * day later first makes every value below a function of its millisecond
 * alone, and the same as natalChart computes there: its own calls are always
 * more than 86.4 ms apart.
 */
function freshCaches(time: number): void {
  const away = MakeTime(new Date(time + DAY));
  e_tilt(away);
  SiderealTime(away);
}

class Sky {
  readonly instants = new Map<number, Instant>();
  evaluations = 0;
  violations = 0;
  readonly tanPhi: number;

  constructor(
    readonly latitude: number,
    readonly longitude: number,
    readonly system: HouseSystem
  ) {
    this.tanPhi = Math.tan(latitude * DEG);
  }

  private instant(time: number): Instant {
    let found = this.instants.get(time);
    if (!found) {
      if (++this.evaluations > MAX_EVALUATIONS) {
        throw new RangeError(
          "The window needs more evaluations than the search allows; a quantity stays within its rounding or jitter band of a boundary for too long."
        );
      }
      found = { lon: new Float64Array(12).fill(Number.NaN), angles: undefined };
      this.instants.set(time, found);
    }
    return found;
  }

  forget(time: number): void {
    this.instants.delete(time);
  }

  lon(time: number, body: number): number {
    const at = this.instant(time);
    let value = at.lon[body]!;
    if (Number.isNaN(value)) {
      if (body === SOUTH) value = normalizeLongitude(this.lon(time, NORTH) + 180);
      else {
        freshCaches(time);
        value = bodyLongitude(BODIES[body]!, new Date(time));
      }
      at.lon[body] = value;
    }
    return value;
  }

  angles(time: number): AngleState {
    const at = this.instant(time);
    if (!at.angles) {
      freshCaches(time);
      // As computeChart: sidereal time and true obliquity from one AstroTime.
      const astroTime = MakeTime(new Date(time));
      const input: AngleInput = {
        gastHours: SiderealTime(astroTime),
        latitude: this.latitude,
        longitude: this.longitude,
        obliquity: e_tilt(astroTime).tobl
      };
      const angles = computeAngles(input);
      const houses = computeHouses(this.system, input, angles);
      at.angles = {
        ramc: normalizeLongitude(input.gastHours * 15 + input.longitude),
        obliquity: input.obliquity,
        asc: angles.asc,
        mc: angles.mc,
        cusps: houses.houses.cusps,
        fellBack: houses.fellBack
      };
    }
    return at.angles;
  }

  /** A component's discrete value at a millisecond, computed as natalChart computes it. */
  value(time: number, id: number): number {
    if (id < ASC) return signIndexForLongitude(this.lon(time, id));
    if (id === ASC) return signIndexForLongitude(this.angles(time).asc);
    if (id === MC) return signIndexForLongitude(this.angles(time).mc);
    if (id < ASPECT) return houseOf(this.lon(time, id - HOUSE), this.angles(time).cusps);
    if (id < SYSTEM) {
      const [first, second] = PAIRS[id - ASPECT]!;
      const match = matchAspect(
        BODIES[first]!,
        this.lon(time, first),
        BODIES[second]!,
        this.lon(time, second)
      );
      return match ? ASPECT_TYPES.indexOf(match.definition.type) : -1;
    }
    return this.angles(time).fellBack ? 1 : 0;
  }
}

/** Enclosures over one interval of the search, computed as they are needed. */
class Interval {
  private readonly bodies: (Range | undefined)[] = [];
  private context: AngleContext | null | undefined;
  private cuspList: Range[] | null | undefined;
  private spans: boolean | undefined;
  private stable: boolean | undefined;

  constructor(
    private readonly sky: Sky,
    private readonly t1: number,
    private readonly t2: number
  ) {}

  mayChange(id: number): boolean {
    if (id < ASC) return reaches(this.body(id), 30, 0, BAND);
    if (id === ASC) return reaches(this.angleContext()?.asc ?? null, 30, 0, BAND);
    if (id === MC) return reaches(this.angleContext()?.mc ?? null, 30, 0, BAND);
    if (id < ASPECT) return this.houseMayChange(id - HOUSE);
    if (id < SYSTEM) return this.aspectMayChange(id - ASPECT);
    return !this.systemStable();
  }

  private violation(): null {
    this.sky.violations += 1;
    return null;
  }

  /** A body's longitude: rate-bounded from both ends, widened by any jitter. */
  body(index: number): Range {
    const known = this.bodies[index];
    if (known !== undefined) return known;
    const { sky, t1, t2 } = this;
    const reach = (RATES[index]! * (t2 - t1)) / DAY;
    // Each end is the smooth motion plus at most J, and so is every instant
    // between: the enclosure of the smooth part widens by J, then by J again.
    const jitter = index >= NORTH ? 2 * Math.max(nodeJitter(t1), nodeJitter(t2)) : 0;
    const l1 = sky.lon(t1, index);
    const step = signedDelta(l1, sky.lon(t2, index));
    let range: Range;
    if (reach + jitter >= 90) range = null;
    else if (Math.abs(step) > reach + jitter + 1e-12) range = this.violation();
    else {
      const middle = l1 + step / 2;
      const half = reach / 2 + jitter;
      range = [middle - half, middle + half];
    }
    this.bodies[index] = range;
    return range;
  }

  private aspectMayChange(pair: number): boolean {
    const { sky, t1, t2 } = this;
    const [first, second] = PAIRS[pair]!;
    const s1 = separation(sky.lon(t1, first), sky.lon(t1, second));
    const s2 = separation(sky.lon(t2, first), sky.lon(t2, second));
    const reach = ((RATES[first]! + RATES[second]!) * (t2 - t1)) / DAY;
    if (Math.abs(s2 - s1) > reach + 1e-12) {
      this.violation();
      return true;
    }
    const lo = (s1 + s2 - reach) / 2 - BAND;
    const hi = (s1 + s2 + reach) / 2 + BAND;
    const edges = first < 2 ? LUMINARY_ORB_EDGES : ORB_EDGES;
    return edges.some((edge) => edge >= lo && edge <= hi);
  }

  /** Whether Placidus or Koch keeps one side of its polar limit throughout. */
  private systemStable(): boolean {
    if (this.stable !== undefined) return this.stable;
    const { sky, t1, t2 } = this;
    let stable = true;
    if (isPolarUndefinedHouseSystem(sky.system)) {
      const e1 = sky.angles(t1).obliquity;
      const dEps = (OBLIQUITY_RATE * (t2 - t1)) / DAY;
      if (Math.abs(sky.angles(t2).obliquity - e1) > dEps + 1e-12) {
        this.violation();
        stable = false;
      } else {
        const limit = 90 - Math.abs(sky.latitude);
        stable = limit < e1 - dEps - 1e-12 || limit > e1 + dEps + 1e-12;
      }
    }
    this.stable = stable;
    return stable;
  }

  /** The RAMC's advance, the obliquity, the midheaven and the ascendant. */
  angleContext(): AngleContext | null {
    if (this.context !== undefined) return this.context;
    this.context = null;
    const { sky, t1, t2 } = this;
    if (t2 - t1 > MAX_ANGLE_MS) return null;
    const a1 = sky.angles(t1);
    const a2 = sky.angles(t2);
    const turn = wrap360(a2.ramc - a1.ramc);
    const expected = (SIDEREAL_RATE * (t2 - t1)) / DAY;
    const dEps = (OBLIQUITY_RATE * (t2 - t1)) / DAY;
    if (Math.abs(turn - expected) > 1e-3 + 1e-6 * expected) return this.violation();
    if (Math.abs(a2.obliquity - a1.obliquity) > dEps + 1e-12) return this.violation();
    const theta1 = a1.ramc;
    const theta2 = theta1 + turn;
    const c = Math.cos(a1.obliquity * DEG);
    const s = Math.sin(a1.obliquity * DEG);
    const tanPhi = sky.tanPhi;
    const mc = obliqueRange(theta1, theta2, 0, c, 0, dEps)?.range ?? null;
    const raw = obliqueRange(theta1 + 90, theta2 + 90, tanPhi * s, c, tanPhi, dEps)?.range ?? null;
    let gap: Range = null;
    let turned: boolean | null = null;
    let asc: Range = null;
    if (mc && raw) {
      const difference: Range = [raw[0] - mc[1], raw[1] - mc[0]];
      if (!reaches(difference, 180, 0, BAND)) {
        gap = difference;
        turned = wrap360((difference[0] + difference[1]) / 2) >= 180;
        asc = turned ? shift(raw, 180) : raw;
      }
    }
    const context: AngleContext = {
      theta1,
      theta2,
      c,
      s,
      dEps,
      mc: this.holds(mc, a1.mc, a2.mc),
      raw,
      gap,
      turned,
      asc: this.holds(asc, a1.asc, a2.asc)
    };
    this.context = context;
    return context;
  }

  /** The range, if the engine's own values at both ends lie in it; otherwise a recorded violation. */
  private holds(range: Range, v1: number, v2: number): Range {
    if (range === null) return null;
    return reaches(range, 360, v1, 1e-7) && reaches(range, 360, v2, 1e-7)
      ? range
      : this.violation();
  }

  private houseMayChange(index: number): boolean {
    if (!this.systemStable()) return true;
    const body = this.body(index);
    const context = this.angleContext();
    if (body === null || context === null) return true;
    const { sky, t1 } = this;
    if (sky.system === "whole" || sky.angles(t1).fellBack) {
      return reaches(body, 30, 0, BAND) || reaches(context.asc, 30, 0, BAND);
    }
    const cusps = this.cusps();
    if (cusps === null || this.spansMayClose()) return true;
    return cusps.some(
      (cusp) => cusp === null || reaches([body[0] - cusp[1], body[1] - cusp[0]], 360, 0, BAND)
    );
  }

  /** Whether two neighbouring cusps may meet, which would reorder houseOf's arcs. */
  private spansMayClose(): boolean {
    if (this.spans !== undefined) return this.spans;
    const cusps = this.cusps();
    const system = this.sky.system;
    let spans = false;
    if (cusps === null) spans = true;
    else if (system !== "equal" && system !== "vehlow" && system !== "equal-mc") {
      spans = cusps.some((cusp, index) => {
        const next = cusps[(index + 1) % 12]!;
        return cusp === null || next === null || reaches([next[0] - cusp[1], next[1] - cusp[0]], 360, 0, BAND);
      });
    }
    this.spans = spans;
    return spans;
  }

  /** Ranges of the twelve cusps of a system that has not fallen back; null if any is unknown. */
  private cusps(): Range[] | null {
    if (this.cuspList !== undefined) return this.cuspList;
    this.cuspList = null;
    const context = this.angleContext();
    if (context === null) return null;
    const list = this.cuspRanges(context);
    if (list === null) return null;
    const a1 = this.sky.angles(this.t1);
    const a2 = this.sky.angles(this.t2);
    const checked = list.map((range, index) => this.holds(range, a1.cusps[index]!, a2.cusps[index]!));
    if (checked.some((range) => range === null)) return null;
    this.cuspList = checked;
    return checked;
  }

  private cuspRanges(context: AngleContext): Range[] | null {
    const { sky, t1, t2 } = this;
    const { theta1, theta2, c, s, dEps, mc, asc, raw, turned, gap } = context;
    const every = (make: (index: number) => Range) => Array.from({ length: 12 }, (_, index) => make(index));
    const tanPhi = sky.tanPhi;
    switch (sky.system) {
      case "equal":
        return every((index) => shift(asc, index * 30));
      case "vehlow":
        return every((index) => shift(asc, index * 30 - 15));
      case "equal-mc":
        return every((index) => shift(mc, (index - 9) * 30));
      case "porphyry": {
        if (mc === null || gap === null || turned === null) return null;
        // Every cusp is the midheaven plus a fixed arc plus a fixed fraction of
        // the arc from the midheaven to the ascendant, which lies in (0°, 180°).
        const middle = (gap[0] + gap[1]) / 2;
        const upper = shift(gap, -Math.floor(middle / 180) * 180)!;
        const parts = [
          [0, 1],
          [60, 2 / 3],
          [120, 1 / 3],
          [180, 0],
          [180, 1 / 3],
          [180, 2 / 3],
          [180, 1],
          [240, 2 / 3],
          [300, 1 / 3],
          [0, 0],
          [0, 1 / 3],
          [0, 2 / 3]
        ] as const;
        return parts.map(([arc, fraction]) => [
          mc[0] + arc + fraction * upper[0],
          mc[1] + arc + fraction * upper[1]
        ]);
      }
      case "placidus": {
        // Outside the polar circle each intermediate cusp increases with the
        // sidereal time: the iteration's slope is at most 2q/3 < 1, q = tan φ tan ε.
        const a1 = sky.angles(t1);
        const a2 = sky.angles(t2);
        const q = Math.abs(tanPhi) * (s / c);
        if (!(q < 1)) return null;
        const g = (2 / 3) * Math.abs(tanPhi) / (c * c * c * Math.sqrt(1 - q * q) * (1 - (2 * q) / 3)) + s / c;
        const pad = 2 * g * dEps + 1e-8;
        return every((index) => {
          if (index === 0) return asc;
          if (index === 3) return shift(mc, 180);
          if (index === 6) return shift(asc, 180);
          if (index === 9) return mc;
          const from = a1.cusps[index]!;
          return hull(from, advance(from, a2.cusps[index]!), pad);
        });
      }
      case "koch": {
        const a1 = sky.angles(t1);
        const a2 = sky.angles(t2);
        const q = Math.abs(tanPhi) * (s / c);
        if (!(q < 1)) return null;
        const third = (mcLongitude: number, obliquity: number) =>
          (90 +
            Math.asin(
              tanPhi * Math.tan(Math.asin(Math.sin(obliquity * DEG) * Math.sin(mcLongitude * DEG)))
            ) *
              RAD) /
          3;
        const third1 = third(a1.mc, a1.obliquity);
        const third2 = third(a2.mc, a2.obliquity);
        const k = tanPhi * s;
        const coupling = ((2 / 3) * Math.abs(tanPhi)) / (c * c * Math.sqrt(1 - q * q));
        const at = (m: number): Range => {
          // The ascension θ + 90° + m·third increases with θ (|d third/dθ| <= q/3 < 1/3).
          const from = theta1 + 90 + m * third1;
          const to = theta2 + 90 + m * third2;
          const found = obliqueRange(Math.min(from, to), Math.max(from, to), k, c, tanPhi, dEps);
          if (found === null) return null;
          const pad = 2 * coupling * found.rate * dEps;
          return [found.range[0] - pad, found.range[1] + pad];
        };
        return quadrant(asc, mc, at(-2), at(-1), at(1), at(2));
      }
      case "regiomontanus":
      case "campanus":
      case "topocentric": {
        if (turned === null) return null;
        const circles = circleSystem(sky.system, sky.latitude);
        const [c11, c12, c2, c3] = circles.map(([ascension, pole]) => {
          const tanPole = Math.tan(pole * DEG);
          return obliqueRange(theta1 + ascension, theta2 + ascension, tanPole * s, c, tanPole, dEps)?.range ?? null;
        }) as [Range, Range, Range, Range];
        const cusps = quadrant(raw, mc, c11, c12, c2, c3);
        return turned ? cusps.map((range) => shift(range, 180)) : cusps;
      }
      case "alcabitius": {
        if (asc === null) return null;
        // day = acos(−tan φ tan δ), δ the ascendant's declination: monotone in
        // sin(ascendant) and in sin ε separately, so extreme at the corners.
        const [u1, u2] = sinRange(asc[0], asc[1]);
        const obliquity = sky.angles(t1).obliquity;
        const sines = [Math.sin((obliquity - dEps) * DEG), Math.sin((obliquity + dEps) * DEG)];
        let xLo = Infinity;
        let xHi = -Infinity;
        for (const u of [u1, u2]) {
          for (const sine of sines) {
            const x = -tanPhi * Math.tan(Math.asin(sine * u));
            xLo = Math.min(xLo, x);
            xHi = Math.max(xHi, x);
          }
        }
        // Widen the argument for rounding before acos, whose slope is unbounded
        // at ±1, so that the widening carries through it.
        const rounding = 1e-12 * (1 + Math.max(Math.abs(xLo), Math.abs(xHi)));
        const clamp = (x: number) => Math.min(1, Math.max(-1, x));
        const dayLo = Math.acos(clamp(xHi + rounding)) * RAD;
        const dayHi = Math.acos(clamp(xLo - rounding)) * RAD;
        const at = (base: number, fraction: number): Range =>
          obliqueRange(theta1 + base + fraction * dayLo, theta2 + base + fraction * dayHi, 0, c, 0, dEps)?.range ?? null;
        return quadrant(asc, mc, at(0, 1 / 3), at(0, 2 / 3), at(60, 2 / 3), at(120, 1 / 3));
      }
      case "meridian":
        return every((index) => obliqueRange(theta1 + 90 + index * 30, theta2 + 90 + index * 30, 0, c, 0, dEps)?.range ?? null);
      case "morinus":
        return every((index) => morinusRange(theta1 + 90 + index * 30, theta2 + 90 + index * 30, c, dEps));
      case "whole":
        return null;
      default:
        throw new RangeError(`Unknown house system ${String(sky.system satisfies never)}.`);
    }
  }
}

/** houses.ts's quadrantCusps, on ranges. */
function quadrant(asc: Range, mc: Range, c11: Range, c12: Range, c2: Range, c3: Range): Range[] {
  return [asc, c2, c3, shift(mc, 180), shift(c11, 180), shift(c12, 180), shift(asc, 180), shift(c2, 180), shift(c3, 180), mc, c11, c12];
}

/** The ascension offsets and pole heights of houses.ts's circle systems, for the 11th, 12th, 2nd and 3rd cusps. */
function circleSystem(system: HouseSystem, latitude: number): (readonly [number, number])[] {
  const phi = latitude * DEG;
  if (system === "campanus") {
    const sine = Math.sin(phi);
    const cosine = Math.cos(phi);
    const near = Math.asin(sine / 2) * RAD;
    const far = Math.asin((Math.sqrt(3) / 2) * sine) * RAD;
    const wide = Math.atan(Math.sqrt(3) / cosine) * RAD;
    const narrow = Math.atan(1 / (Math.sqrt(3) * cosine)) * RAD;
    return [
      [90 - wide, near],
      [90 - narrow, far],
      [90 + narrow, far],
      [90 + wide, near]
    ];
  }
  const tangent = Math.tan(phi);
  const [near, far] =
    system === "regiomontanus"
      ? [Math.atan(tangent * 0.5) * RAD, Math.atan(tangent * Math.cos(30 * DEG)) * RAD]
      : [Math.atan(tangent / 3) * RAD, Math.atan((tangent * 2) / 3) * RAD];
  return [
    [30, near],
    [60, far],
    [120, far],
    [150, near]
  ];
}

interface Change {
  at: number;
  id: number;
  from: number;
  to: number;
}

/**
 * Every millisecond in (t1, t2] at which an active component's value differs
 * from the millisecond before. An interval is dropped for a component when its
 * enclosure keeps clear of every threshold and its two ends agree; otherwise it
 * is halved, down to single milliseconds, where the ends are compared directly.
 */
function search(sky: Sky, t1: number, t2: number, active: readonly number[], changes: Change[]): void {
  if (t2 - t1 === 1) {
    for (const id of active) {
      const from = sky.value(t1, id);
      const to = sky.value(t2, id);
      if (from !== to) changes.push({ at: t2, id, from, to });
    }
    return;
  }
  const interval = new Interval(sky, t1, t2);
  const next: number[] = [];
  for (const id of active) {
    const may = interval.mayChange(id);
    const differs = sky.value(t1, id) !== sky.value(t2, id);
    if (differs && !may) sky.violations += 1;
    if (may || differs) next.push(id);
  }
  if (next.length === 0) return;
  const middle = t1 + Math.floor((t2 - t1) / 2);
  search(sky, t1, middle, next, changes);
  search(sky, middle, t2, next, changes);
  sky.forget(middle);
}

function finiteMinutes(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive, finite number of minutes.`);
  }
  const milliseconds = Math.round(value * 60_000);
  if (milliseconds < 1) throw new RangeError(`${label} must be at least one millisecond.`);
  return milliseconds;
}

function resolvedWindow(input: BirthWindowInput): { start: number; end: number; rounding: BirthWindow["rounding"] } {
  let rounding: BirthWindow["rounding"] = null;
  if (input.rounding !== undefined) {
    const model = input.rounding;
    if (!model || typeof model !== "object") throw new RangeError("rounding must be an object.");
    const recorded = dateFrom(model.recorded, "rounding.recorded");
    const unit = finiteMinutes(model.minutes, "rounding.minutes");
    const mode = model.mode ?? "nearest";
    if (mode !== "nearest" && mode !== "down") throw new RangeError('rounding.mode must be "nearest" or "down".');
    const from = recorded.getTime() - (mode === "nearest" ? Math.floor(unit / 2) : 0);
    rounding = {
      recorded,
      minutes: model.minutes,
      mode,
      start: new Date(from),
      end: new Date(from + unit)
    };
  }
  const hasRange = input.start !== undefined || input.end !== undefined;
  const hasCentre = input.at !== undefined || input.minutes !== undefined;
  if (hasRange && hasCentre) throw new RangeError("Give start and end, or at and minutes, not both.");
  let start: number;
  let end: number;
  if (hasRange) {
    start = dateFrom(input.start as DateInput, "start").getTime();
    end = dateFrom(input.end as DateInput, "end").getTime();
  } else if (hasCentre) {
    const centre = dateFrom(input.at as DateInput, "at").getTime();
    const half = finiteMinutes(input.minutes, "minutes");
    start = centre - half;
    end = centre + half;
  } else if (rounding) {
    start = rounding.start.getTime();
    end = rounding.end.getTime();
  } else {
    throw new RangeError("A window needs start and end, at and minutes, or a rounding model.");
  }
  if (!(end > start)) throw new RangeError("The window must end after it starts.");
  if (end - start > MAX_WINDOW_MS) throw new RangeError("The window must be at most 48 hours long.");
  if (!Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime())) {
    throw new RangeError("The window must lie within the range of Date.");
  }
  if (rounding && (rounding.start.getTime() < start || rounding.end.getTime() > end)) {
    throw new RangeError("The rounding model's unit must lie inside the window.");
  }
  return { start, end, rounding };
}

function features(values: readonly number[], system: HouseSystem): WindowFeatures {
  const signs = {} as Record<BodyName, ZodiacSign>;
  const houses = {} as Record<BodyName, HouseNumber>;
  BODIES.forEach((body, index) => {
    signs[body] = SIGN_NAMES[values[index]!]!;
    houses[body] = values[HOUSE + index] as HouseNumber;
  });
  const aspects: WindowAspect[] = [];
  PAIRS.forEach(([first, second], pair) => {
    const type = values[ASPECT + pair]!;
    if (type >= 0) aspects.push({ a: BODIES[first]!, b: BODIES[second]!, type: ASPECT_TYPES[type]! });
  });
  return {
    signs,
    ascendant: SIGN_NAMES[values[ASC]!]!,
    midheaven: SIGN_NAMES[values[MC]!]!,
    houses,
    aspects,
    houseSystem: values[SYSTEM] === 1 ? "whole" : system
  };
}

function change(id: number, from: number, to: number, system: HouseSystem): WindowChange {
  if (id < ASC) return { feature: "sign", body: BODIES[id]!, from: SIGN_NAMES[from]!, to: SIGN_NAMES[to]! };
  if (id === ASC || id === MC) {
    return { feature: id === ASC ? "ascendant" : "midheaven", from: SIGN_NAMES[from]!, to: SIGN_NAMES[to]! };
  }
  if (id < ASPECT) {
    return { feature: "house", body: BODIES[id - HOUSE]!, from: from as HouseNumber, to: to as HouseNumber };
  }
  if (id < SYSTEM) {
    const [first, second] = PAIRS[id - ASPECT]!;
    return {
      feature: "aspect",
      a: BODIES[first]!,
      b: BODIES[second]!,
      from: from < 0 ? null : ASPECT_TYPES[from]!,
      to: to < 0 ? null : ASPECT_TYPES[to]!
    };
  }
  return { feature: "house-system", from: from === 1 ? "whole" : system, to: to === 1 ? "whole" : system };
}

/**
 * Partition a birth-time window into cells within which every discrete feature
 * of the chart is constant: each body's sign and house, the signs of the
 * ascendant and midheaven, the aspects in orb (natalChart's definitions and
 * orbs) and, for Placidus and Koch, whether the houses fall back to whole
 * signs. Each switch gives the first millisecond of its new cell and what
 * changed, from what to what; each cell gives its share of the window under a
 * uniform prior and, when `rounding` is given, under that rounding model.
 *
 * The window is [start, end), at most 48 hours. Every value is the engine's
 * own at a millisecond, so the cells agree with natalChart at every instant.
 * The search brackets each quantity with a rate bound and bisects to the
 * millisecond; how the bounds are justified is in the README. Results are
 * labelled {@link WINDOW_VERIFICATION}: they have been checked against dense
 * sampling, not proven. Throws RangeError for invalid input, and when the
 * search would need more than two million evaluated instants.
 */
export function birthWindow(input: BirthWindowInput): BirthWindow {
  if (!input || typeof input !== "object") throw new RangeError("input must be an object.");
  const settings = validateBirthSettings({
    latitude: input.latitude,
    longitude: input.longitude,
    ...(input.houseSystem === undefined ? {} : { houseSystem: input.houseSystem })
  });
  if (settings.latitude === undefined || settings.longitude === undefined) {
    throw new RangeError("A window needs a latitude and a longitude.");
  }
  const latitude = settings.latitude;
  const longitude = settings.longitude;
  if (Math.abs(latitude) === 90) {
    // The engine's ascendant there is 0° or 180° to rounding at every instant.
    throw new RangeError("latitude must lie strictly between -90 and 90 degrees: no ascendant is defined at a pole.");
  }
  const system = settings.houseSystem ?? "whole";
  const { start, end, rounding } = resolvedWindow(input);

  SetDeltaTFunction(deltaT);
  const sky = new Sky(latitude, longitude, system);
  const ids = Array.from({ length: SYSTEM + 1 }, (_, id) => id).filter(
    (id) => id !== SYSTEM || isPolarUndefinedHouseSystem(system)
  );
  const last = end - 1;
  const values = Array.from({ length: SYSTEM + 1 }, (_, id) => (id === SYSTEM && !ids.includes(SYSTEM) ? 0 : sky.value(start, id)));
  const changes: Change[] = [];
  if (last > start) search(sky, start, last, ids, changes);
  changes.sort((a, b) => a.at - b.at || a.id - b.id);

  const cells: BirthWindowCell[] = [];
  const switches: BirthWindowSwitch[] = [];
  const length = end - start;
  const support = rounding ? [rounding.start.getTime(), rounding.end.getTime()] : null;
  let cellStart = start;
  let fallback = values[SYSTEM] === 1;
  const close = (cellEnd: number) => {
    const milliseconds = cellEnd - cellStart;
    const cell: BirthWindowCell = {
      start: new Date(cellStart),
      end: new Date(cellEnd),
      milliseconds,
      share: milliseconds / length,
      features: features(values, system)
    };
    if (support) {
      const overlap = Math.max(0, Math.min(cellEnd, support[1]!) - Math.max(cellStart, support[0]!));
      cell.roundedShare = overlap / (support[1]! - support[0]!);
    }
    cells.push(cell);
    cellStart = cellEnd;
  };
  for (let index = 0; index < changes.length; ) {
    const at = changes[index]!.at;
    close(at);
    const list: WindowChange[] = [];
    for (; index < changes.length && changes[index]!.at === at; index += 1) {
      const { id, from, to } = changes[index]!;
      if (values[id] !== from) sky.violations += 1;
      values[id] = to;
      list.push(change(id, from, to, system));
    }
    if (values[SYSTEM] === 1) fallback = true;
    switches.push({ at: new Date(at), changes: list });
  }
  close(end);

  const flags: BirthWindowFlag[] = [];
  if (fallback) flags.push("polar-fallback");
  if (outsideReferenceSpan(new Date(start)) || outsideReferenceSpan(new Date(last))) {
    flags.push("outside-reference-span");
  }
  if (sky.violations > 0) flags.push("bound-exceeded");
  return {
    schema: "zodiacs.birth-window.v1",
    verification: WINDOW_VERIFICATION,
    start: new Date(start),
    end: new Date(end),
    latitude,
    longitude,
    houseSystem: system,
    rounding,
    cells,
    switches,
    flags,
    engineVersion: ENGINE_VERSION
  };
}
