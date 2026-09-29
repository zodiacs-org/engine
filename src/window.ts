/**
 * Birth-time windows: the partition of a window of possible birth instants
 * into cells within which every discrete feature of the chart is constant.
 *
 * This entry point carries the engine's ephemeris, like the root entry point,
 * and is separate from it so that the root entry point does not grow.
 */
import {
  BackdatePosition,
  Body,
  C_AUDAY,
  GeoVector,
  MakeTime,
  SetDeltaTFunction,
  SiderealTime,
  e_tilt
} from "astronomy-engine";

import { ASPECTS, ASPECT_TYPES, matchAspect, separation } from "./aspects.js";
import { validateBirthSettings } from "./birth-input.js";
import { dateFrom } from "./date-input.js";
import { DELTA_T_TABLE, deltaT } from "./deltat.js";
import { bodyLongitude } from "./ephemeris.js";
import { computeAngles, computeHouses, houseOf, isPolarUndefinedHouseSystem } from "./houses.js";
import type { AngleInput } from "./houses.js";
import { REFERENCE_SPAN } from "./reference-span.js";
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
 * 0.26°/day). Scanned at 3,000 consecutive milliseconds every five days from
 * 1800 to 2200, the departure reaches 4.8e-5° (in 2187); the bound is at
 * least 2.97 times every value found. Scanned, not derived.
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
/** The span a window must lie in, over which the bounds above were scanned. */
const SPAN_FROM = Date.parse(REFERENCE_SPAN.from);
const SPAN_TO = Date.parse(REFERENCE_SPAN.to);
/** Latitudes within this many degrees of a pole are refused. */
const POLE_MARGIN = 1e-6;
/**
 * Where the node may come within its jitter band of a sign boundary it is
 * sampled hourly, then every minute; a band reaches to where those samples lie
 * BAND_EDGE jitter bounds from the boundary, and the cost of resolving it is
 * estimated from where they lie within BAND_COST.
 */
const NODE_COARSE_MS = 3_600_000;
const NODE_FINE_MS = 60_000;
const BAND_EDGE = 5;
const BAND_COST = 3;
/** A component's value in an unresolved interval. */
const UNRESOLVED = -2;

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
/** astronomy-engine's bodies for the light-time backdating of the Sun and planets. */
const BACKDATED: (Body | null)[] = [
  Body.Sun,
  null,
  Body.Mercury,
  Body.Venus,
  Body.Mars,
  Body.Jupiter,
  Body.Saturn,
  Body.Uranus,
  Body.Neptune,
  Body.Pluto,
  null,
  null
];

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

/**
 * RAMCs at which a Placidus cusp's right ascension reaches 90° or 270° as the
 * latitude approaches the polar limit, and at which Koch's midheaven has its
 * extreme declination: there the cusps carry the rounding of asin near ±1.
 */
const SENSITIVE_RAMC: Partial<Record<HouseSystem, readonly [north: number[], south: number[]]>> = {
  placidus: [
    [30, 150, 210, 270, 330],
    [30, 90, 150, 210, 330]
  ],
  koch: [
    [90, 270],
    [90, 270]
  ]
};

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
  /** Each body's sign; null for the nodes inside an unresolved interval. */
  signs: Record<BodyName, ZodiacSign | null>;
  ascendant: ZodiacSign;
  midheaven: ZodiacSign;
  /**
   * Each body's house, as houseOf gives it from the chart's cusps; null for
   * the nodes inside an unresolved interval where the houses are whole signs.
   */
  houses: Record<BodyName, HouseNumber | null>;
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

/** A change to or from null opens or closes an unresolved interval; it is not a crossing. */
export type WindowChange =
  | { feature: "sign"; body: BodyName; from: ZodiacSign | null; to: ZodiacSign | null }
  | { feature: "ascendant" | "midheaven"; from: ZodiacSign; to: ZodiacSign }
  | { feature: "house"; body: BodyName; from: HouseNumber | null; to: HouseNumber | null }
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

/** Where the node's jitter would outlast the budget: these features are null in every cell of [start, end). */
export interface WindowUnresolved {
  start: Date;
  /** The first instant at which they are resolved again. */
  end: Date;
  milliseconds: number;
  features: { feature: "sign" | "house"; body: "North Node" | "South Node" }[];
}

export type BirthWindowFlag =
  | "polar-fallback"
  /** An interval's end-to-end change broke a bound; completeness is then not established. */
  | "bound-exceeded"
  /** The result lists unresolved intervals. */
  | "node-unresolved";

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
  /** Intervals left unresolved, in time order; empty unless `node-unresolved` is flagged. */
  unresolved: WindowUnresolved[];
  flags: BirthWindowFlag[];
  engineVersion: string;
}

/** Thrown when a window needs more evaluated instants than the search allows. An Error, not a RangeError. */
export class WindowBudgetError extends Error {
  override readonly name = "WindowBudgetError";
  /** The instants the search allows. */
  readonly limit = MAX_EVALUATIONS;

  constructor() {
    super(
      `The window needs more than ${MAX_EVALUATIONS} evaluated instants.`
    );
  }
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
 * Steps across which a quantity may jump: for each body and for the angles,
 * instants z such that the step from z − 1 ms to z may cross a seam of the ΔT
 * model, where TT, and every position computed from it, steps back.
 */
interface Seams {
  bodies: number[][];
  angles: number[];
}

/**
 * astronomy-engine reuses its last nutation for any instant within 1e-6 day
 * (86.4 ms) and its last sidereal time for the same instant. Moving both to a
 * day later first makes every value below a function of its millisecond
 * alone, and the same as a lone natalChart call computes there.
 */
function freshCaches(time: number): void {
  const away = MakeTime(new Date(time + DAY));
  e_tilt(away);
  SiderealTime(away);
}

/** Days from J2000 on astronomy-engine's UT scale, computed as its AstroTime computes them. */
const utDays = (time: number) => (time - J2000) / DAY;
/** Whether ΔT at this UT comes from deltat.ts's table rather than its spline, decided as deltat.ts decides it. */
const onTable = (ut: number) => !(2000 + ut / 365.25 < DELTA_T_TABLE.from);

/** The first millisecond in (from, to] at which `holds` is true, given that it is false at `from` and true at `to`. */
function firstWhere(holds: (time: number) => boolean, from: number, to: number): number {
  let low = from;
  let high = to;
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (holds(middle)) high = middle;
    else low = middle;
  }
  return high;
}

/**
 * The ΔT model's one discontinuity inside REFERENCE_SPAN is where its spline
 * hands over to its table, at the start of DELTA_T_TABLE.from (1941.0,
 * 1940-12-31T18:00:00Z). The Moon, the obliquity and the sidereal time step
 * there; the true node also 864 ms either side, where one of the two lunar
 * positions it differences crosses it; the Sun and planets one light time
 * later, where their backdated positions cross it. Each step is found from the
 * engine's own arithmetic, and kept with a millisecond either side.
 */
function seamsIn(start: number, end: number): Seams {
  const none: Seams = { bodies: BODIES.map(() => []), angles: [] };
  const near = J2000 + (DELTA_T_TABLE.from - 2000) * 365.25 * DAY;
  // Pluto's light time is under six hours.
  if (end < near - 2_000 || start > near + 7 * 3_600_000) return none;
  const crossing = (offsetDays: number) =>
    firstWhere((time) => onTable(utDays(time) + offsetDays), near - 2_000, near + 2_000);
  const around = (time: number) => [time - 1, time, time + 1];
  const seam = crossing(0);
  const bodies = BODIES.map((_, index) => {
    if (index >= NORTH) return [...around(crossing(1e-5)), ...around(seam), ...around(crossing(-1e-5))];
    const body = BACKDATED[index];
    if (body === undefined || body === null) return around(seam);
    const departs = (time: number) => onTable(BackdatePosition(MakeTime(new Date(time)), Body.Earth, body, true).t.ut);
    const light = (GeoVector(body, MakeTime(new Date(seam)), true).Length() / C_AUDAY) * DAY;
    let from = seam + Math.floor(light) - 10_000;
    let to = seam + Math.ceil(light) + 10_000;
    while (departs(from)) from -= 60_000;
    while (!departs(to)) to += 60_000;
    return [...around(seam), ...around(firstWhere(departs, from, to))];
  });
  return { bodies, angles: around(seam) };
}

class Sky {
  readonly instants = new Map<number, Instant>();
  evaluations = 0;
  violations = 0;
  readonly tanPhi: number;
  readonly sensitive: readonly number[];

  constructor(
    readonly latitude: number,
    readonly longitude: number,
    readonly system: HouseSystem,
    readonly seams: Seams
  ) {
    this.tanPhi = Math.tan(latitude * DEG);
    // RAMCs near which the cusps are sensitive, for Placidus and Koch.
    const values = SENSITIVE_RAMC[system];
    this.sensitive = values ? values[latitude >= 0 ? 0 : 1] : [];
  }

  private instant(time: number): Instant {
    let found = this.instants.get(time);
    if (!found) {
      if (++this.evaluations > MAX_EVALUATIONS) throw new WindowBudgetError();
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

  node(time: number): number {
    // The north node's longitude, outside the search and its budget.
    freshCaches(time);
    return bodyLongitude("North Node", new Date(time));
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

  value(time: number, id: number): number {
    // A component's discrete value at a millisecond, computed as natalChart computes it.
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
  private guard: boolean | undefined;

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
    return this.guarded() || !this.systemStable();
  }

  private violation(): null {
    this.sky.violations += 1;
    return null;
  }

  private jumps(seams: readonly number[]): boolean {
    // Whether one of the steps in `seams` lies in the interval: t1 < z <= t2.
    return seams.some((z) => this.t1 < z && z <= this.t2);
  }

  body(index: number): Range {
    // A body's longitude: rate-bounded from both ends, widened by any jitter; unknown across a seam.
    const known = this.bodies[index];
    if (known !== undefined) return known;
    const { sky, t1, t2 } = this;
    const reach = (RATES[index]! * (t2 - t1)) / DAY;
    // Each end is the smooth motion plus at most J, and so is every instant
    // between: the enclosure of the smooth part widens by J, then by J again.
    const jitter = index >= NORTH ? 2 * Math.max(nodeJitter(t1), nodeJitter(t2)) : 0;
    let range: Range;
    if (reach + jitter >= 90 || this.jumps(sky.seams.bodies[index]!)) range = null;
    else {
      const l1 = sky.lon(t1, index);
      const step = signedDelta(l1, sky.lon(t2, index));
      if (Math.abs(step) > reach + jitter + 1e-12) range = this.violation();
      else {
        const middle = l1 + step / 2;
        const half = reach / 2 + jitter;
        range = [middle - half, middle + half];
      }
    }
    this.bodies[index] = range;
    return range;
  }

  private aspectMayChange(pair: number): boolean {
    const { sky, t1, t2 } = this;
    const [first, second] = PAIRS[pair]!;
    if (this.jumps(sky.seams.bodies[first]!) || this.jumps(sky.seams.bodies[second]!)) return true;
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

  private systemStable(): boolean {
    // Whether Placidus or Koch keeps one side of its polar limit throughout.
    if (this.stable !== undefined) return this.stable;
    const { sky, t1, t2 } = this;
    let stable = true;
    if (isPolarUndefinedHouseSystem(sky.system)) {
      if (this.jumps(sky.seams.angles)) stable = false;
      else {
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
    }
    this.stable = stable;
    return stable;
  }

  private guarded(): boolean {
    // Whether Placidus or Koch is within 1e-8° (and the obliquity's possible
    // change) of its polar limit while the RAMC passes within 0.1° of a value
    // where its cusps carry asin's rounding near ±1. The system and the houses
    // are then resolved millisecond by millisecond.
    if (this.guard !== undefined) return this.guard;
    const { sky, t1, t2 } = this;
    let guard = false;
    if (sky.sensitive.length > 0) {
      const a1 = sky.angles(t1);
      const dEps = (OBLIQUITY_RATE * (t2 - t1)) / DAY;
      if (Math.abs(90 - Math.abs(sky.latitude) - a1.obliquity) <= dEps + 1e-8) {
        const turn = ((SIDEREAL_RATE * (t2 - t1)) / DAY) * (1 + 1e-6) + 1e-3;
        guard = turn >= 360 || sky.sensitive.some((value) => reaches([a1.ramc, a1.ramc + turn], 360, value, 0.1));
      }
    }
    this.guard = guard;
    return guard;
  }

  angleContext(): AngleContext | null {
    // The RAMC's advance, the obliquity, the midheaven and the ascendant; unknown across a seam.
    if (this.context !== undefined) return this.context;
    this.context = null;
    const { sky, t1, t2 } = this;
    if (t2 - t1 > MAX_ANGLE_MS || this.jumps(sky.seams.angles)) return null;
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

  private holds(range: Range, v1: number, v2: number): Range {
    // The range, if the engine's own values at both ends lie in it; otherwise a recorded violation.
    if (range === null) return null;
    return reaches(range, 360, v1, 1e-7) && reaches(range, 360, v2, 1e-7)
      ? range
      : this.violation();
  }

  private houseMayChange(index: number): boolean {
    if (this.guarded() || !this.systemStable()) return true;
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

  private spansMayClose(): boolean {
    // Whether two neighbouring cusps may meet, which would reorder houseOf's arcs.
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

  private cusps(): Range[] | null {
    // Ranges of the twelve cusps of a system that has not fallen back; null if any is unknown.
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
  /** NaN for the start or end of an unresolved interval: whatever the value was. */
  from: number;
  to: number;
}

/**
 * An interval in which some components are left to a search of their own:
 * the main search skips them on every interval inside [a − 1, b], so that it
 * finds none of their changes at instants in [a, b].
 */
interface Band {
  a: number;
  b: number;
  ids: readonly number[];
  /** Estimated instants a search of the band evaluates. */
  cost: number;
}

/**
 * Every millisecond in (t1, t2] at which an active component's value differs
 * from the millisecond before. An interval is dropped for a component when its
 * enclosure keeps clear of every threshold and its two ends agree; otherwise it
 * is halved, down to single milliseconds, where the ends are compared directly.
 */
function search(
  sky: Sky,
  t1: number,
  t2: number,
  active: readonly number[],
  changes: Change[],
  bands: readonly Band[]
): void {
  for (const band of bands) {
    if (t1 >= band.a - 1 && t2 <= band.b) active = active.filter((id) => !band.ids.includes(id));
  }
  if (active.length === 0) return;
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
  search(sky, t1, middle, next, changes, bands);
  search(sky, middle, t2, next, changes, bands);
  sky.forget(middle);
}

/**
 * Stretches of [start, last] where the north node's smooth motion may come
 * within BAND_EDGE jitter bounds of a sign boundary. Outside them the search
 * drops the node's intervals of up to some seconds; inside, near a slow
 * ingress, it would compare the node at every millisecond, where its jitter
 * makes the sign change back and forth. Between samples a minute apart the
 * smooth motion is their straight line to within 1e-7°, and each sample is
 * that motion to within one jitter bound.
 */
function nodeBands(sky: Sky, start: number, last: number): { a: number; b: number; cost: number }[] {
  const jitter = Math.max(nodeJitter(start), nodeJitter(last));
  const edge = BAND_EDGE * jitter;
  const width = BAND_COST * jitter;
  const bands: { a: number; b: number; cost: number }[] = [];
  let open: { a: number; b: number; cost: number } | null = null;
  const include = (t0: number, u0: number, t1: number, u1: number) => {
    const lo = Math.min(u0, u1);
    const hi = Math.max(u0, u1);
    if (!reaches([lo, hi], 30, 0, edge)) return;
    // Milliseconds at which the straight line lies within `width` of a boundary.
    let near = 0;
    for (let boundary = Math.ceil((lo - width) / 30) * 30; boundary <= hi + width; boundary += 30) {
      const overlap = Math.min(hi, boundary + width) - Math.max(lo, boundary - width);
      if (overlap < 0) continue;
      near += hi > lo ? (overlap / (hi - lo)) * (t1 - t0) : t1 - t0;
    }
    if (open && open.b >= t0) {
      open.b = t1;
      open.cost += near;
    } else {
      if (open) bands.push(open);
      open = { a: t0, b: t1, cost: near };
    }
  };
  let previous = start;
  let value = sky.node(start);
  for (let time = Math.min(start + NODE_COARSE_MS, last); time > previous; time = Math.min(time + NODE_COARSE_MS, last)) {
    const next = value + signedDelta(value, sky.node(time));
    const reach = (RATES[NORTH]! * (time - previous)) / DAY;
    const half = reach / 2 + 2 * jitter;
    const middle = (value + next) / 2;
    if (reaches([middle - half, middle + half], 30, 0, edge)) {
      let t0 = previous;
      let u0 = value;
      for (let t1 = Math.min(t0 + NODE_FINE_MS, time); t1 > t0; t1 = Math.min(t1 + NODE_FINE_MS, time)) {
        const u1 = t1 === time ? next : u0 + signedDelta(u0, sky.node(t1));
        include(t0, u0, t1, u1);
        t0 = t1;
        u0 = u1;
      }
    }
    previous = time;
    value = next;
  }
  if (open) bands.push(open);
  return bands;
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
  if (!(start >= SPAN_FROM && end <= SPAN_TO)) {
    throw new RangeError("The window must lie inside REFERENCE_SPAN, 1800 to 2200.");
  }
  if (rounding && (rounding.start.getTime() < start || rounding.end.getTime() > end)) {
    throw new RangeError("The rounding model's unit must lie inside the window.");
  }
  return { start, end, rounding };
}

function features(values: readonly number[], system: HouseSystem): WindowFeatures {
  const signs = {} as Record<BodyName, ZodiacSign | null>;
  const houses = {} as Record<BodyName, HouseNumber | null>;
  BODIES.forEach((body, index) => {
    const sign = values[index]!;
    const house = values[HOUSE + index]!;
    signs[body] = sign === UNRESOLVED ? null : SIGN_NAMES[sign]!;
    houses[body] = house === UNRESOLVED ? null : (house as HouseNumber);
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
  const sign = (value: number) => (value === UNRESOLVED ? null : SIGN_NAMES[value]!);
  const house = (value: number) => (value === UNRESOLVED ? null : (value as HouseNumber));
  if (id < ASC) return { feature: "sign", body: BODIES[id]!, from: sign(from), to: sign(to) };
  if (id === ASC || id === MC) {
    return { feature: id === ASC ? "ascendant" : "midheaven", from: SIGN_NAMES[from]!, to: SIGN_NAMES[to]! };
  }
  if (id < ASPECT) return { feature: "house", body: BODIES[id - HOUSE]!, from: house(from), to: house(to) };
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
 * Partition a birth-time window, [start, end) of at most 48 hours inside
 * REFERENCE_SPAN, into cells within which each body's sign and house, the
 * signs of the ascendant and midheaven, the aspects in orb and any Placidus or
 * Koch fallback are constant. Values are the engine's own at each millisecond,
 * as a lone natalChart call computes them. Where the search's bounds hold
 * (README), each cell holds natalChart's features at every millisecond, except
 * the nodes' in the intervals listed in `unresolved`, which are null. Labelled
 * {@link WINDOW_VERIFICATION}: checked against dense sampling, not proven.
 * Throws RangeError for invalid input, and WindowBudgetError, which is not a
 * RangeError, when the search would need more than two million instants.
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
  if (Math.abs(latitude) > 90 - POLE_MARGIN) {
    // At a pole the engine's ascendant is 0° or 180° to rounding at every
    // instant, and near one it turns too fast for the search's budget.
    throw new RangeError("latitude must be at least 1e-6 degrees from either pole.");
  }
  const system = settings.houseSystem ?? "whole";
  const { start, end, rounding } = resolvedWindow(input);

  SetDeltaTFunction(deltaT);
  const sky = new Sky(latitude, longitude, system, seamsIn(start, end));
  const ids = Array.from({ length: SYSTEM + 1 }, (_, id) => id).filter(
    (id) => id !== SYSTEM || isPolarUndefinedHouseSystem(system)
  );
  const last = end - 1;

  // Where the node lies within its jitter band of a sign boundary, its sign
  // (and its house, where the houses are whole signs) are left to a search of
  // their own, run after the rest only while the budget still covers it.
  const bands: Band[] = nodeBands(sky, start, last).map(({ a, b, cost }) => {
    const until = b >= last ? end : b;
    const top = Math.min(until, last);
    const whole =
      system === "whole" ||
      (isPolarUndefinedHouseSystem(system) &&
        (sky.angles(a).fellBack || sky.angles(top).fellBack || new Interval(sky, a, top).mayChange(SYSTEM)));
    return { a, b: until, ids: whole ? [NORTH, SOUTH, HOUSE + NORTH, HOUSE + SOUTH] : [NORTH, SOUTH], cost };
  });
  // Their values where each band ends, in case it is left unresolved.
  const resume = bands.map((band) => (band.b < end ? band.ids.map((id) => sky.value(band.b, id)) : []));

  const values = Array.from({ length: SYSTEM + 1 }, (_, id) => (id === SYSTEM && !ids.includes(SYSTEM) ? 0 : sky.value(start, id)));
  const changes: Change[] = [];
  if (last > start) search(sky, start, last, ids, changes, bands);

  // Cheapest first: a band is searched when its every instant fits in what is
  // left of the budget, or its estimated cost does; a search that runs out
  // leaves it unresolved.
  const unresolved: number[] = [];
  for (const index of bands.map((_, index) => index).sort((x, y) => bands[x]!.cost - bands[y]!.cost)) {
    const band = bands[index]!;
    const from = Math.max(band.a - 1, start);
    const to = Math.min(band.b, last);
    const remaining = MAX_EVALUATIONS - sky.evaluations;
    if (to - from + 1 <= remaining || band.cost + 1_000 <= remaining) {
      const found: Change[] = [];
      try {
        search(sky, from, to, band.ids, found, []);
        changes.push(...found);
        continue;
      } catch (error) {
        if (!(error instanceof WindowBudgetError)) throw error;
      }
    }
    unresolved.push(index);
  }
  unresolved.sort((x, y) => bands[x]!.a - bands[y]!.a);
  for (const index of unresolved) {
    const band = bands[index]!;
    band.ids.forEach((id, position) => {
      if (band.a === start) values[id] = UNRESOLVED;
      else changes.push({ at: band.a, id, from: Number.NaN, to: UNRESOLVED });
      if (band.b < end) changes.push({ at: band.b, id, from: UNRESOLVED, to: resume[index]![position]! });
    });
  }
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
    const list: WindowChange[] = [];
    const updates: Change[] = [];
    for (; index < changes.length && changes[index]!.at === at; index += 1) {
      const entry = changes[index]!;
      const from = Number.isNaN(entry.from) ? values[entry.id]! : entry.from;
      if (values[entry.id] !== from) sky.violations += 1;
      if (from !== entry.to) list.push(change(entry.id, from, entry.to, system));
      updates.push(entry);
    }
    if (list.length === 0) continue;
    close(at);
    for (const { id, to } of updates) values[id] = to;
    if (values[SYSTEM] === 1) fallback = true;
    switches.push({ at: new Date(at), changes: list });
  }
  close(end);

  const flags: BirthWindowFlag[] = [];
  if (fallback) flags.push("polar-fallback");
  if (sky.violations > 0) flags.push("bound-exceeded");
  if (unresolved.length > 0) flags.push("node-unresolved");
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
    unresolved: unresolved.map((index) => {
      const { a, b, ids: bandIds } = bands[index]!;
      return {
        start: new Date(a),
        end: new Date(b),
        milliseconds: b - a,
        features: bandIds.map((id) => ({
          feature: id < ASC ? ("sign" as const) : ("house" as const),
          body: BODIES[id < ASC ? id : id - HOUSE] as "North Node" | "South Node"
        }))
      };
    }),
    flags,
    engineVersion: ENGINE_VERSION
  };
}
