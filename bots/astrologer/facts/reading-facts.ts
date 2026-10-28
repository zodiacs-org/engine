/**
 * Reading facts for the Astrologer bot: every number a reading may state,
 * computed by this engine's own code (positions, houses, sect, aspects,
 * crossings, civil time), so the bot never does degree arithmetic itself.
 *
 * Kept outside src/ on purpose: it is a bot tool, not part of the package,
 * and nothing here reaches dist/ or the carried archive.
 */
import { CONFIGURED_ASPECT_ANGLES, createAspectPolicy, findConfiguredAspects } from "../../../src/configured-aspects.js";
import type { AspectPosition, AspectPolicy } from "../../../src/configured-aspects.js";
import { natalChart } from "../../../src/api.js";
import { bodyLongitude, longitudeSpeed } from "../../../src/ephemeris.js";
import { prepareLocalTime, resolveLocalToUtc, zoneOffsetAt } from "../../../src/geo/timezone.js";
import { sectOf } from "../../../src/points.js";
import { searchLongitudeCrossings } from "../../../src/returns.js";
import { degreeInSign, normalizeLongitude, signForLongitude, signIndexForLongitude, SIGNS } from "../../../src/signs.js";
import { moonSignCandidates } from "../../../src/techniques/moon-sign.js";
import { CLASSICAL_PLANETS, dignityRulersAt, essentialDignities, mutualReceptions } from "../../../src/techniques/dignities.js";
import type { ClassicalPlanet } from "../../../src/techniques/dignities.js";
import { separation } from "../../../src/aspects.js";
import type { BodyName, Chart } from "../../../src/types.js";

// ------------------------------------------------------------------ input

export interface ReadingInput {
  /** Local civil date, YYYY-MM-DD (Gregorian). */
  date: string;
  /** Local wall time HH:MM, or null when unknown. */
  time: string | null;
  timeKnown: boolean;
  /** IANA zone of the birthplace. */
  zone: string;
  /** Degrees, north and east positive. */
  lat: number;
  lon: number;
}

export interface ReadingOptions {
  /** First local date of the transit window, YYYY-MM-DD. Default 2026-11-01. */
  windowStart?: string;
  /** Length of the window in days. Default 90. */
  days?: number;
}

// ------------------------------------------------------------------ settings (stated in the output)

/** Bodies whose transits are listed, and the aspects and natal points they are checked against. */
export const TRANSITING: readonly BodyName[] = ["Sun", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
export const SLOW: readonly BodyName[] = ["Uranus", "Neptune", "Pluto"];
export const TRANSIT_ASPECTS = ["conjunction", "square", "trine", "opposition"] as const;
/** Orb, degrees, that defines an in-orb date range. */
export const RANGE_ORB = 1;
/** Below this speed (degrees a day) at an exact hit, a range is given, never a single day. */
export const STATIONARY_SPEED = 0.01;
/** Orb, degrees, for a station's contact with a natal point. */
export const STATION_ORB = 2;
/** Distance, degrees, from a sign edge that is reported. */
export const EDGE_DEGREES = 2;
export const STATION_BODIES: readonly BodyName[] = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const PLANETS: readonly BodyName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const MAJOR = ["conjunction", "sextile", "square", "trine", "opposition"] as const;

const DAY = 86_400_000;
const MINUTE = 60_000;

// ------------------------------------------------------------------ output types

export interface Placement {
  point: string;
  lon: number;
  sign: string;
  /** Degree in sign, truncated to the arcminute, e.g. 14°30'. */
  degree: string;
  /** Whole sign house, null without a birth time. */
  house: number | null;
  retrograde: boolean;
}

export interface NatalAspect {
  rank: number;
  a: string;
  b: string;
  type: string;
  orb: number;
}

export interface EdgePoint {
  point: string;
  sign: string;
  degree: string;
  /** "start" when within EDGE_DEGREES after the sign begins, "end" when within it before the sign ends. */
  edge: "start" | "end";
  /** Degrees to the edge. */
  distance: number;
  /** The neighbouring sign across that edge. */
  neighbour: string;
  /** For the Ascendant, Midheaven and Moon: the birth-time shift, minutes, that moves the point into the neighbour; null when none within the search. */
  shiftMinutes: number | null;
}

export interface Transit {
  body: BodyName;
  aspect: string;
  natal: string;
  /** Exact hits, local dates YYYY-MM-DD. */
  exact: string[];
  /** In-orb date range (within RANGE_ORB), local dates, for slow bodies and hits near a station; otherwise null. */
  range: { from: string; to: string; openStart: boolean; openEnd: boolean } | null;
  /** True when a hit has |speed| below STATIONARY_SPEED. */
  nearStation: boolean;
  /** Sort key: first relevant instant, ms. */
  sortMs: number;
  /** The moving body's sign and whole sign house (null without a birth time) at each exact hit and at the ends of the range, local dates. */
  positions: { date: string; sign: string; house: number | null }[];
}

export interface Station {
  body: BodyName;
  kind: "retrograde" | "direct";
  utc: string;
  localDate: string;
  lon: number;
}

export interface StationContact {
  station: Station;
  /** Natal points within STATION_ORB of a major aspect, tightest first. */
  contacts: { natal: string; type: string; orb: number }[];
  /** Natal points that were checked. */
  checked: string[];
}

/** Calendar age of the native on the first day of the window, from the local birth date. */
export interface Age {
  /** The local date the age is taken on (the window start). */
  at: string;
  years: number;
  months: number;
  /** True when the birth date is after the window start; years and months are then 0. */
  bornAfterStart: boolean;
  /** Days from the window start to the birth date when born after it, else 0. */
  daysAfterStart: number;
  stage: "infant" | "child" | "adolescent" | "adult";
}

/** The planets of each sect, after Ptolemy, Tetrabiblos I.7. */
export interface SectTeam {
  sect: "day" | "night";
  light: ClassicalPlanet;
  beneficOfSect: ClassicalPlanet;
  maleficOfSect: ClassicalPlanet;
  beneficContrary: ClassicalPlanet;
  /** The out-of-sect malefic. */
  maleficContrary: ClassicalPlanet;
}

export const SECT_TEAMS: Readonly<Record<"day" | "night", SectTeam>> = Object.freeze({
  day: { sect: "day", light: "Sun", beneficOfSect: "Jupiter", maleficOfSect: "Saturn", beneficContrary: "Venus", maleficContrary: "Mars" },
  night: { sect: "night", light: "Moon", beneficOfSect: "Venus", maleficOfSect: "Mars", beneficContrary: "Jupiter", maleficContrary: "Saturn" }
});

export interface PlanetDignity {
  planet: ClassicalPlanet;
  sign: string;
  degree: string;
  /** Held by this planet here, in the order domicile, exaltation, triplicity, term, face. Without sect, triplicity is left out (see triplicityIf). */
  dignities: string[];
  debilities: string[];
  /** No essential dignity (Lilly); null when it turns on the unknown sect. */
  peregrine: boolean | null;
  /** Unknown sect only: the sects in which this planet would hold triplicity here. */
  triplicityIf: ("day" | "night")[];
  /** Who holds each dignity at this degree. */
  lords: {
    domicile: ClassicalPlanet;
    exaltation: ClassicalPlanet | null;
    element: string;
    triplicity: { day: ClassicalPlanet; night: ClassicalPlanet; participating: ClassicalPlanet };
    term: { planet: ClassicalPlanet; from: number; to: number };
    face: { planet: ClassicalPlanet; from: number; to: number };
    detriment: ClassicalPlanet;
    fall: ClassicalPlanet | null;
  };
}

/** The chart ruler: the domicile lord of the rising sign, with its condition. */
export interface ChartRuler {
  risingSign: string;
  planet: ClassicalPlanet;
  placement: Placement;
  dignity: PlanetDignity;
  /** Its place in the sect team, in words. */
  sectRole: string;
  /** Natal aspects that involve the ruler, in the ranking's order. */
  aspects: NatalAspect[];
}

/** One body's domicile lord and the chain of domicile lords from it (traditional rulers). */
export interface DispositorChain {
  point: string;
  sign: string;
  /** The domicile lord of its sign. */
  lord: ClassicalPlanet;
  /** The body, then each lord in turn, until a planet in its own domicile, a repeat (a loop) or the Moon with an unknown sign. */
  chain: string[];
  end: { kind: "domicile"; planet: ClassicalPlanet } | { kind: "loop"; planets: ClassicalPlanet[] } | { kind: "unknown"; planet: "Moon" };
}

export interface Dispositors {
  chains: DispositorChain[];
  /** The one planet in its own domicile where every classical planet's chain ends, or null. */
  final: ClassicalPlanet | null;
  /** Mutual receptions by domicile (the engine's `mutualReceptions`). */
  mutual: [ClassicalPlanet, ClassicalPlanet][];
}

/** A planet or the node on an angle: a natal conjunction or opposition with the Ascendant or Midheaven from the aspect ranking. */
export interface AngleContact {
  point: string;
  type: "conjunction" | "opposition";
  /** The aspect's partner in the ranking. */
  angle: "Ascendant" | "Midheaven";
  /** The angle it is on: conjunction Ascendant is on the Ascendant, opposition Ascendant on the Descendant, and so on. */
  on: "Ascendant" | "Descendant" | "Midheaven" | "IC";
  orb: number;
  /** Rank of the same aspect in the natal ranking. */
  rank: number;
}

/** The next calendar anniversary of the local birth date on or after the window start. */
export interface Birthday {
  date: string;
  /** Age reached on that date. */
  turns: number;
  inWindow: boolean;
  /** Born on 29 February: in a common year the date given is 1 March. */
  leapDay: boolean;
}

export interface ChartVersion {
  label: string;
  /** Gap and fold: the offset the clock reading was read on, minutes east, and which side of the change it is. */
  readOn: { offset: number; side: "before" | "after" } | null;
  utc: string;
  localTime: string;
  timeKnown: boolean;
  placements: Placement[];
  ascendant: Placement | null;
  midheaven: Placement | null;
  sect: "day" | "night" | null;
  /** The sect team of this chart; null without a birth time. */
  sectTeam: SectTeam | null;
  /** Mercury's phase: morning star when it is west of the Sun in longitude (rises before it), evening star when east. */
  mercuryPhase: "morning" | "evening";
  dignities: PlanetDignity[];
  placidusUndefined: boolean;
  aspects: NatalAspect[];
  /** Null without a birth time. */
  chartRuler: ChartRuler | null;
  /** Empty when no planet is on an angle; null without a birth time. */
  angleContacts: AngleContact[] | null;
  /** Points in whole sign houses 1, 4, 7 and 10; null without a birth time. */
  angularHouses: { house: 1 | 4 | 7 | 10; points: string[] }[] | null;
  /** The solar return for the next birthday: the local date the Sun is back at its natal longitude. Null when born on or after the window start. */
  solarReturn: { date: string; inWindow: boolean } | null;
  edges: EdgePoint[];
  /** The rising sign's sensitivity to the birth time: the shift, minutes, that moves the Ascendant into the sign before or after; null without a birth time, a side null when none within the search. */
  risingShift: { sign: string; degree: string; earlier: { sign: string; minutes: number } | null; later: { sign: string; minutes: number } | null } | null;
  transits: Transit[];
  transitPoints: string[];
  stationContacts: StationContact[];
  /** Dispositor chains of the bodies Sun to Pluto shown in the chart. */
  dispositors: Dispositors;
  /** Unknown time only: the Moon's possible signs over the local date. */
  moonSigns: string[] | null;
  /** Unknown time only: other bodies whose sign changes during the local date, with the signs in order. */
  daySignChanges: { point: string; signs: string[] }[];
}

export interface ReadingFacts {
  input: ReadingInput;
  status: "resolved" | "gap" | "fold" | "time-unknown";
  lmt: boolean;
  /** Gap and fold: the zone's offsets either side of the change, minutes east. */
  offsets: { before: number; after: number } | null;
  window: { from: string; toInclusive: string; days: number; zone: string };
  age: Age;
  /** Null when born on or after the window start. */
  birthday: Birthday | null;
  stations: Station[];
  versions: ChartVersion[];
}

// ------------------------------------------------------------------ helpers

function truncatedMinutes(lon: number): number {
  return Math.floor(degreeInSign(lon) * 60 + 1e-9);
}

/** Degree in sign, truncated to the arcminute: never shows 30°00'. */
export function degreeText(lon: number): string {
  const minutes = truncatedMinutes(lon);
  return `${Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, "0")}'`;
}

/** An orb or distance in degrees, rounded to the arcminute. */
export function orbText(degrees: number): string {
  const minutes = Math.round(degrees * 60);
  return `${Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, "0")}'`;
}

function localParts(zone: string, ms: number): { date: string; time: string } {
  const shifted = new Date(ms + zoneOffsetAt(zone, ms) * MINUTE).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

function localDate(zone: string, ms: number): string {
  return localParts(zone, ms).date;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function offsetText(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const m = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function signName(lon: number): string {
  return signForLongitude(lon).name;
}

function placement(point: string, lon: number, ascendant: number | null, retrograde: boolean): Placement {
  return {
    point,
    lon,
    sign: signName(lon),
    degree: degreeText(lon),
    house: ascendant === null ? null : ((signIndexForLongitude(lon) - signIndexForLongitude(ascendant) + 12) % 12) + 1,
    retrograde
  };
}

/** |offset| of `lon` from `target`, degrees in [0, 180]. */
function offsetFrom(lon: number, target: number): number {
  return separation(lon, target);
}

// ------------------------------------------------------------------ age

/** Calendar age on local date `at` of someone born on local date `birth` (both YYYY-MM-DD). */
export function ageAt(birth: string, at: string): Age {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ay, am, ad] = at.split("-").map(Number) as [number, number, number];
  if (birth > at) {
    const days = Math.round((Date.parse(`${birth}T00:00:00Z`) - Date.parse(`${at}T00:00:00Z`)) / DAY);
    return { at, years: 0, months: 0, bornAfterStart: true, daysAfterStart: days, stage: "infant" };
  }
  let months = (ay - by) * 12 + (am - bm);
  if (ad < bd) months -= 1;
  const years = Math.floor(months / 12);
  const stage = years < 2 ? "infant" : years < 13 ? "child" : years < 18 ? "adolescent" : "adult";
  return { at, years, months: months % 12, bornAfterStart: false, daysAfterStart: 0, stage };
}

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The next calendar anniversary of local birth date `birth` on or after local date `from`, and the age reached then; null when born on or after `from`. */
export function nextBirthday(birth: string, from: string, days: number): Birthday | null {
  // Born on or after the window start: no anniversary yet.
  if (birth >= from) return null;
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const leapDay = bm === 2 && bd === 29;
  const on = (y: number) => (leapDay && !isLeapYear(y) ? `${y}-03-01` : `${y}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`);
  let year = Number(from.slice(0, 4));
  if (on(year) < from) year += 1;
  const date = on(year);
  return { date, turns: year - by, inWindow: date <= addDays(from, days - 1), leapDay };
}

// ------------------------------------------------------------------ dignities

function planetDignity(planet: ClassicalPlanet, lon: number, sect: "day" | "night" | null): PlanetDignity {
  const r = dignityRulersAt(lon);
  const lords: PlanetDignity["lords"] = {
    domicile: r.domicile,
    exaltation: r.exaltation,
    element: r.triplicity.element,
    triplicity: { day: r.triplicity.day, night: r.triplicity.night, participating: r.triplicity.participating },
    term: { ...r.term },
    face: { ...r.face },
    detriment: r.detriment,
    fall: r.fall
  };
  const base = { planet, sign: signName(lon), degree: degreeText(lon), lords };
  if (sect) {
    const d = essentialDignities(planet, lon, sect);
    return { ...base, dignities: [...d.dignities], debilities: [...d.debilities], peregrine: d.peregrine, triplicityIf: [] };
  }
  const day = essentialDignities(planet, lon, "day");
  const night = essentialDignities(planet, lon, "night");
  const triplicityIf = (["day", "night"] as const).filter((s) => (s === "day" ? day : night).dignities.includes("triplicity"));
  const dignities = day.dignities.filter((x) => x !== "triplicity");
  return {
    ...base,
    dignities: [...dignities],
    debilities: [...day.debilities],
    peregrine: dignities.length > 0 ? false : triplicityIf.length === 0 ? true : triplicityIf.length === 2 ? false : null,
    triplicityIf: [...triplicityIf]
  };
}

// ------------------------------------------------------------------ chart ruler and angles

/** A classical planet's place in the sect team, in words. */
export function sectRole(planet: ClassicalPlanet, team: SectTeam | null, mercuryPhase: "morning" | "evening"): string {
  if (!team) return "unavailable (sect needs a birth time)";
  if (planet === "Mercury") {
    const joins = mercuryPhase === "morning" ? "day" : "night";
    return `a ${mercuryPhase} star, so it joins the ${joins} sect: ${joins === team.sect ? "in sect" : "contrary to sect"} in this ${team.sect} chart`;
  }
  if (planet === team.light) return `sect light of this ${team.sect} chart`;
  if (planet === "Sun" || planet === "Moon") return `the ${planet === "Sun" ? "day" : "night"} light, contrary to sect in this ${team.sect} chart`;
  if (planet === team.beneficOfSect) return "benefic of sect";
  if (planet === team.maleficOfSect) return "malefic of sect";
  if (planet === team.beneficContrary) return "benefic contrary to sect";
  return "malefic contrary to sect (the out-of-sect malefic)";
}

const ANGLE_ON = {
  Ascendant: { conjunction: "Ascendant", opposition: "Descendant" },
  Midheaven: { conjunction: "Midheaven", opposition: "IC" }
} as const;

/** Planets on an angle: the natal conjunctions and oppositions with the Ascendant or Midheaven in the ranking. */
export function angleContactsFrom(aspects: NatalAspect[]): AngleContact[] {
  const out: AngleContact[] = [];
  for (const a of aspects) {
    if (a.type !== "conjunction" && a.type !== "opposition") continue;
    const angle = a.b === "Ascendant" || a.b === "Midheaven" ? a.b : a.a === "Ascendant" || a.a === "Midheaven" ? a.a : null;
    if (!angle) continue;
    const point = angle === a.b ? a.a : a.b;
    if (point === "Ascendant" || point === "Midheaven") continue;
    out.push({ point, type: a.type, angle, on: ANGLE_ON[angle][a.type], orb: a.orb, rank: a.rank });
  }
  return out;
}

// ------------------------------------------------------------------ civil time

interface Instant {
  label: string;
  ms: number;
  /** Gap and fold: the offset the clock reading was read on, minutes east, and which side of the change it is. */
  readOn?: { offset: number; side: "before" | "after" };
}

function resolveCivil(input: ReadingInput): { status: ReadingFacts["status"]; lmt: boolean; offsets: ReadingFacts["offsets"]; instants: Instant[] } {
  if (!input.timeKnown || input.time === null) {
    const noon = resolveLocalToUtc(input.date, "12:00", input.zone, { longitude: input.lon });
    return {
      status: "time-unknown",
      lmt: noon.flags.includes("lmt"),
      offsets: null,
      instants: [{ label: "reference chart at local noon (birth time unknown): planets only", ms: noon.utc.getTime() }]
    };
  }
  const r = resolveLocalToUtc(input.date, input.time, input.zone, { longitude: input.lon });
  const lmt = r.flags.includes("lmt");
  if (!r.jump) return { status: "resolved", lmt, offsets: null, instants: [{ label: "chart", ms: r.utc.getTime() }] };
  const t = r.transition;
  if (!t) throw new Error("A gap or fold without a transition.");
  const wall = Date.parse(`${r.date}T${input.time}:00Z`);
  const onBefore = wall - t.offsetBeforeMinutes * MINUTE;
  const onAfter = wall - t.offsetAfterMinutes * MINUTE;
  const offsets = { before: t.offsetBeforeMinutes, after: t.offsetAfterMinutes };
  if (r.jump.kind === "fold") {
    return {
      status: "fold",
      lmt,
      offsets,
      instants: [
        { label: `earlier occurrence (clock on ${offsetText(t.offsetBeforeMinutes)})`, ms: onBefore, readOn: { offset: t.offsetBeforeMinutes, side: "before" } },
        { label: `later occurrence (clock on ${offsetText(t.offsetAfterMinutes)})`, ms: onAfter, readOn: { offset: t.offsetAfterMinutes, side: "after" } }
      ]
    };
  }
  // A gap: the wall time read on either offset; listed in time order.
  const readings = [
    { label: `candidate read on the offset before the change (${offsetText(t.offsetBeforeMinutes)})`, ms: onBefore, readOn: { offset: t.offsetBeforeMinutes, side: "before" as const } },
    { label: `candidate read on the offset after the change (${offsetText(t.offsetAfterMinutes)})`, ms: onAfter, readOn: { offset: t.offsetAfterMinutes, side: "after" as const } }
  ].sort((a, b) => a.ms - b.ms);
  return { status: "gap", lmt, offsets, instants: readings };
}

// ------------------------------------------------------------------ stations

export function findStations(fromMs: number, toMs: number, zone: string): Station[] {
  const out: Station[] = [];
  for (const body of STATION_BODIES) {
    let t0 = fromMs;
    let s0 = longitudeSpeed(body, new Date(t0));
    for (let t1 = fromMs + DAY / 2; t0 < toMs; t1 += DAY / 2) {
      const end = Math.min(t1, toMs);
      const s1 = longitudeSpeed(body, new Date(end));
      if (s0 !== 0 && Math.sign(s1) !== Math.sign(s0)) {
        let lo = t0;
        let hi = end;
        const sLo = s0;
        while (hi - lo > MINUTE) {
          const mid = (lo + hi) / 2;
          if (Math.sign(longitudeSpeed(body, new Date(mid))) === Math.sign(sLo)) lo = mid;
          else hi = mid;
        }
        const at = Math.round((lo + hi) / 2);
        out.push({
          body,
          kind: s0 > 0 ? "retrograde" : "direct",
          utc: new Date(at).toISOString().slice(0, 16) + "Z",
          localDate: localDate(zone, at),
          lon: bodyLongitude(body, new Date(at))
        });
      }
      t0 = end;
      s0 = s1;
    }
  }
  return out.sort((a, b) => a.utc.localeCompare(b.utc));
}

function stationContacts(stations: Station[], natal: AspectPosition[]): StationContact[] {
  const label = "Station point";
  const policy = createAspectPolicy({
    aspects: MAJOR.map((type) => ({ type, orb: STATION_ORB, luminaryOrb: STATION_ORB })),
    bodies: [label, ...natal.map((p) => p.body)]
  });
  return stations.map((station) => {
    const found = findConfiguredAspects([{ body: label, lon: station.lon, speed: 0 }, ...natal], policy).aspects
      .filter((a) => a.a === label || a.b === label)
      .map((a) => ({ natal: a.a === label ? a.b : a.a, type: a.type, orb: a.orb }));
    return { station, contacts: found, checked: natal.map((p) => p.body) };
  });
}

// ------------------------------------------------------------------ transits

interface Samples {
  start: number;
  lons: number[];
}

const SAMPLE_MARGIN_DAYS = 800;

function sampleBody(body: BodyName, fromMs: number, toMs: number): Samples {
  const start = fromMs - SAMPLE_MARGIN_DAYS * DAY;
  const count = Math.ceil((toMs - fromMs) / DAY) + 2 * SAMPLE_MARGIN_DAYS + 1;
  const lons: number[] = [];
  for (let i = 0; i < count; i += 1) lons.push(bodyLongitude(body, new Date(start + i * DAY)));
  return { start, lons };
}

/** Bisect the instant where the body's offset from `target` crosses RANGE_ORB between an in-orb and an out-of-orb instant. */
function orbEdge(body: BodyName, target: number, inside: number, outside: number): number {
  let a = inside;
  let b = outside;
  while (Math.abs(b - a) > 10 * MINUTE) {
    const mid = (a + b) / 2;
    if (offsetFrom(bodyLongitude(body, new Date(mid)), target) <= RANGE_ORB) a = mid;
    else b = mid;
  }
  return a;
}

/** The in-orb run around instant `at` (which must be in orb), from the daily samples, refined at both ends. */
function runAround(body: BodyName, target: number, samples: Samples, at: number): { from: number; to: number; openStart: boolean; openEnd: boolean } {
  const n = samples.lons.length;
  const inOrb = (i: number) => offsetFrom(samples.lons[i]!, target) <= RANGE_ORB;
  let i = Math.min(n - 1, Math.max(0, Math.floor((at - samples.start) / DAY)));
  let j = i + 1;
  // Walk outward from the sample at or before `at`.
  while (i >= 0 && inOrb(i)) i -= 1;
  while (j < n && inOrb(j)) j += 1;
  const openStart = i < 0;
  const openEnd = j >= n;
  const from = openStart ? samples.start : orbEdge(body, target, samples.start + (i + 1) * DAY, samples.start + i * DAY);
  const to = openEnd ? samples.start + (n - 1) * DAY : orbEdge(body, target, samples.start + (j - 1) * DAY, samples.start + j * DAY);
  return { from: Math.min(from, at), to: Math.max(to, at), openStart, openEnd };
}

function findTransits(points: { name: string; lon: number }[], fromMs: number, toMs: number, zone: string, ascendant: number | null): Transit[] {
  const out: Transit[] = [];
  const positionsAt = (body: BodyName, instants: number[]) => instants.map((ms) => {
    const p = placement(body, bodyLongitude(body, new Date(ms)), ascendant, false);
    return { date: localDate(zone, ms), sign: p.sign, house: p.house };
  });
  for (const body of TRANSITING) {
    const slow = SLOW.includes(body);
    const samples = body === "Sun" ? null : sampleBody(body, fromMs, toMs);
    for (const point of points) {
      for (const aspect of TRANSIT_ASPECTS) {
        const angle = CONFIGURED_ASPECT_ANGLES[aspect];
        const targets = [...new Set([normalizeLongitude(point.lon + angle), normalizeLongitude(point.lon - angle)].map((x) => Number(x.toFixed(9))))];
        for (const target of targets) {
          const found = searchLongitudeCrossings(body, target, new Date(fromMs), new Date(toMs), { stepDays: 1 });
          if (found.status !== "complete") throw new Error("crossing search refused");
          const hits = found.crossings.map((c) => c.at.getTime());
          if (!slow) {
            if (hits.length === 0) continue;
            const nearStation = hits.some((h) => Math.abs(longitudeSpeed(body, new Date(h))) < STATIONARY_SPEED);
            let range: Transit["range"] = null;
            let instants = hits;
            if (nearStation && samples) {
              const r = runAround(body, target, samples, hits[0]!);
              range = { from: localDate(zone, r.from), to: localDate(zone, r.to), openStart: r.openStart, openEnd: r.openEnd };
              instants = [r.from, ...hits, r.to];
            }
            out.push({ body, aspect, natal: point.name, exact: hits.map((h) => localDate(zone, h)), range, nearStation, sortMs: hits[0]!, positions: positionsAt(body, instants) });
            continue;
          }
          // Slow bodies: every in-orb run that overlaps the window, with its exact hits (searched over the whole run).
          const s = samples!;
          const windowIdx = [Math.floor((fromMs - s.start) / DAY), Math.ceil((toMs - s.start) / DAY)] as const;
          const seen = new Set<number>();
          const candidates: number[] = [...hits];
          // Any in-orb sample inside the window, or an in-orb window edge, seeds a run.
          for (let i = windowIdx[0]; i <= windowIdx[1]; i += 1) {
            if (offsetFrom(s.lons[i]!, target) <= RANGE_ORB) candidates.push(s.start + i * DAY);
          }
          for (const edge of [fromMs, toMs]) {
            if (offsetFrom(bodyLongitude(body, new Date(edge)), target) <= RANGE_ORB) candidates.push(edge);
          }
          for (const seed of candidates.sort((a, b) => a - b)) {
            const r = runAround(body, target, s, seed);
            const key = Math.round(r.from / DAY);
            if (seen.has(key)) continue;
            seen.add(key);
            if (r.to < fromMs || r.from > toMs) continue;
            const inRun = searchLongitudeCrossings(body, target, new Date(r.from - DAY), new Date(r.to + DAY), { stepDays: 1 });
            if (inRun.status !== "complete") throw new Error("crossing search refused");
            const exact = inRun.crossings.map((c) => c.at.getTime());
            out.push({
              body,
              aspect,
              natal: point.name,
              exact: exact.map((h) => localDate(zone, h)),
              range: { from: localDate(zone, r.from), to: localDate(zone, r.to), openStart: r.openStart, openEnd: r.openEnd },
              nearStation: exact.some((h) => Math.abs(longitudeSpeed(body, new Date(h))) < STATIONARY_SPEED),
              sortMs: Math.max(r.from, fromMs),
              positions: positionsAt(body, [r.from, ...exact, r.to])
            });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.sortMs - b.sortMs || a.body.localeCompare(b.body));
}

// ------------------------------------------------------------------ edges

/** Minutes of birth-time shift (searching both ways up to `limit`) after which `lonAt` falls in `neighbourIndex`. */
function shiftToSign(lonAt: (ms: number) => number, ms: number, neighbourIndex: number, direction: 1 | -1, step: number, limit: number): number | null {
  for (let m = step; m <= limit; m += step) {
    if (signIndexForLongitude(lonAt(ms + direction * m * MINUTE)) === neighbourIndex) {
      // Refine to the minute.
      for (let k = m - step + 1; k <= m; k += 1) {
        if (signIndexForLongitude(lonAt(ms + direction * k * MINUTE)) === neighbourIndex) return k;
      }
      return m;
    }
  }
  return null;
}

function edgePoints(points: { name: string; lon: number }[], ms: number, input: ReadingInput, timeKnown: boolean): EdgePoint[] {
  const out: EdgePoint[] = [];
  const angleAt = (which: "asc" | "mc") => (t: number) => {
    const c = natalChart({ utc: new Date(t), latitude: input.lat, longitude: input.lon, houseSystem: "whole", timeKnown: true });
    return c.angles![which];
  };
  for (const p of points) {
    const d = degreeInSign(p.lon);
    const index = signIndexForLongitude(p.lon);
    let edge: "start" | "end" | null = null;
    if (d < EDGE_DEGREES) edge = "start";
    else if (30 - d < EDGE_DEGREES) edge = "end";
    if (!edge) continue;
    const neighbourIndex = (index + (edge === "start" ? 11 : 1)) % 12;
    let shiftMinutes: number | null = null;
    if (timeKnown) {
      const direction = edge === "start" ? -1 : 1;
      if (p.name === "Ascendant") shiftMinutes = shiftToSign(angleAt("asc"), ms, neighbourIndex, direction, 1, 240);
      else if (p.name === "Midheaven") shiftMinutes = shiftToSign(angleAt("mc"), ms, neighbourIndex, direction, 1, 240);
      else if (p.name === "Moon") shiftMinutes = shiftToSign((t) => bodyLongitude("Moon", new Date(t)), ms, neighbourIndex, direction, 5, 480);
    }
    out.push({
      point: p.name,
      sign: SIGNS[index]!.name,
      degree: degreeText(p.lon),
      edge,
      // From the arcminute-truncated degree shown, so the two numbers agree.
      distance: edge === "start" ? truncatedMinutes(p.lon) / 60 : (1800 - truncatedMinutes(p.lon)) / 60,
      neighbour: SIGNS[neighbourIndex]!.name,
      shiftMinutes
    });
  }
  return out;
}

/** How far the birth time can move, each way, before the Ascendant changes sign (searched minute by minute up to 12 hours). */
function risingSensitivity(asc: number, ms: number, input: ReadingInput): NonNullable<ChartVersion["risingShift"]> {
  const ascAt = (t: number) => natalChart({ utc: new Date(t), latitude: input.lat, longitude: input.lon, houseSystem: "whole", timeKnown: true }).angles!.asc;
  const index = signIndexForLongitude(asc);
  const side = (direction: 1 | -1) => {
    const neighbour = (index + (direction === 1 ? 1 : 11)) % 12;
    const minutes = shiftToSign(ascAt, ms, neighbour, direction, 1, 720);
    return minutes === null ? null : { sign: SIGNS[neighbour]!.name, minutes };
  };
  return { sign: SIGNS[index]!.name, degree: degreeText(asc), earlier: side(-1), later: side(1) };
}

// ------------------------------------------------------------------ one chart version

let natalPolicy: AspectPolicy | null = null;
function natalAspectPolicy(): AspectPolicy {
  natalPolicy ??= createAspectPolicy({
    bodies: [...PLANETS, "North Node", "Ascendant", "Midheaven"]
  });
  return natalPolicy;
}

// ------------------------------------------------------------------ dispositors

/**
 * Each body's domicile lord (`dignityRulersAt`, traditional rulers) and the
 * chain of lords from it. A chain ends at a planet in its own domicile, at a
 * loop of planets that dispose one another, or at the Moon when its sign is
 * unknown. The final dispositor is the single planet in its own domicile
 * where every classical planet's chain ends.
 */
export function dispositorChains(placements: { point: string; lon: number; sign: string }[], moonKnown: boolean): Dispositors {
  const lonOf = new Map(placements.map((p) => [p.point, p.lon]));
  const lordOf = (planet: string): ClassicalPlanet | null => {
    const lon = lonOf.get(planet);
    return lon === undefined ? null : dignityRulersAt(lon).domicile;
  };
  const chains: DispositorChain[] = [];
  for (const p of placements) {
    const lord = dignityRulersAt(p.lon).domicile;
    const chain: string[] = [p.point];
    let end: DispositorChain["end"] | null = null;
    let at: string = p.point;
    while (!end) {
      const next = lordOf(at);
      if (next === null) { end = { kind: "unknown", planet: "Moon" }; break; }
      if (next === at) { end = { kind: "domicile", planet: next }; break; }
      const seen = chain.indexOf(next);
      chain.push(next);
      if (seen >= 0) {
        // The same loop reached from anywhere: start it at the planet first in the classical order.
        const loop = chain.slice(seen, -1) as ClassicalPlanet[];
        const first = loop.reduce((k, x, i) => (CLASSICAL_PLANETS.indexOf(x) < CLASSICAL_PLANETS.indexOf(loop[k]!) ? i : k), 0);
        end = { kind: "loop", planets: [...loop.slice(first), ...loop.slice(0, first)] };
        break;
      }
      if (next === "Moon" && !moonKnown) { end = { kind: "unknown", planet: "Moon" }; break; }
      at = next;
    }
    chains.push({ point: p.point, sign: p.sign, lord, chain, end });
  }
  const classical = chains.filter((c) => (CLASSICAL_PLANETS as readonly string[]).includes(c.point));
  const ends = new Set(classical.map((c) => c.end.kind === "domicile" ? c.end.planet : "-"));
  const final = ends.size === 1 && !ends.has("-") && classical.length > 0 ? ([...ends][0] as ClassicalPlanet) : null;
  const mutual = mutualReceptions(placements.filter((p) => moonKnown || p.point !== "Moon").map((p) => ({ body: p.point as BodyName, lon: p.lon })), { dignities: ["domicile"] })
    .map((m) => [m.a, m.b] as [ClassicalPlanet, ClassicalPlanet]);
  return { chains, final, mutual };
}

function chartVersion(input: ReadingInput, instant: Instant, timeKnown: boolean, window: { fromMs: number; toMs: number; from: string; days: number }, stations: Station[]): ChartVersion {
  const utc = new Date(instant.ms);
  const chart: Chart = natalChart({ utc, latitude: input.lat, longitude: input.lon, houseSystem: "whole", timeKnown });
  const asc = chart.angles?.asc ?? null;
  const mc = chart.angles?.mc ?? null;
  const shown = chart.bodies.filter((b) => b.body !== "South Node" && (timeKnown || b.body !== "Moon"));
  const placements = shown.map((b) => placement(b.body, b.lon, asc, b.retrograde && b.body !== "North Node"));
  let placidusUndefined = false;
  if (timeKnown) {
    const placidus = natalChart({ utc, latitude: input.lat, longitude: input.lon, houseSystem: "placidus", timeKnown: true });
    placidusUndefined = placidus.flags.includes("polar-fallback");
  }

  const positions: AspectPosition[] = shown.map((b) => ({ body: b.body, lon: b.lon, speed: b.speed }));
  if (asc !== null && mc !== null) positions.push({ body: "Ascendant", lon: asc, speed: 0 }, { body: "Midheaven", lon: mc, speed: 0 });
  const aspects = findConfiguredAspects(positions, natalAspectPolicy()).aspects
    .filter((a) => !(a.a === "Ascendant" && a.b === "Midheaven") && !(a.a === "Midheaven" && a.b === "Ascendant"))
    .map((a, i) => ({ rank: i + 1, a: a.a, b: a.b, type: a.type, orb: a.orb }));

  const edgeInput = shown.map((b) => ({ name: b.body as string, lon: b.lon }));
  if (asc !== null && mc !== null) edgeInput.push({ name: "Ascendant", lon: asc }, { name: "Midheaven", lon: mc });
  const edges = edgePoints(edgeInput, instant.ms, input, timeKnown);
  const risingShift = asc === null || !timeKnown ? null : risingSensitivity(asc, instant.ms, input);

  const transitNames = timeKnown ? ["Sun", "Moon", "Mercury", "Venus", "Mars"] : ["Sun", "Mercury", "Venus", "Mars"];
  const transitPoints = shown.filter((b) => transitNames.includes(b.body)).map((b) => ({ name: b.body as string, lon: b.lon }));
  if (asc !== null && mc !== null) transitPoints.push({ name: "Ascendant", lon: asc }, { name: "Midheaven", lon: mc });
  const transits = findTransits(transitPoints, window.fromMs, window.toMs, input.zone, asc);

  const sect = asc === null ? null : sectOf(asc, chart.bodies.find((b) => b.body === "Sun")!.lon);
  const lonOf = (body: BodyName) => chart.bodies.find((b) => b.body === body)!.lon;
  // Mercury west of the Sun (the Sun ahead of it by under 180 degrees) rises before the Sun: a morning star.
  const mercuryPhase = normalizeLongitude(lonOf("Sun") - lonOf("Mercury")) < 180 ? "morning" : "evening";
  const dignities = CLASSICAL_PLANETS.filter((p) => timeKnown || p !== "Moon").map((p) => planetDignity(p, lonOf(p), sect));

  let chartRuler: ChartRuler | null = null;
  if (asc !== null) {
    const planet = dignityRulersAt(asc).domicile;
    chartRuler = {
      risingSign: signName(asc),
      planet,
      placement: placements.find((p) => p.point === planet)!,
      dignity: dignities.find((d) => d.planet === planet)!,
      sectRole: sectRole(planet, sect === null ? null : SECT_TEAMS[sect], mercuryPhase),
      aspects: aspects.filter((a) => a.a === planet || a.b === planet)
    };
  }
  const angularHouses = asc === null
    ? null
    : ([1, 4, 7, 10] as const).map((house) => ({ house, points: placements.filter((p) => p.house === house).map((p) => p.point) }));

  const sunLon = lonOf("Sun");
  let solarReturn: ChartVersion["solarReturn"] = null;
  const bday = nextBirthday(input.date, window.from, window.days);
  if (bday) {
    // The Sun returns to its natal longitude within about two days of the calendar anniversary.
    const around = resolveLocalToUtc(bday.date, "12:00", input.zone).utc.getTime();
    const found = searchLongitudeCrossings("Sun", sunLon, new Date(around - 4 * DAY), new Date(around + 4 * DAY), { stepDays: 1 });
    if (found.status !== "complete" || found.crossings.length !== 1) throw new Error("solar return search failed");
    const at = found.crossings[0]!.at.getTime();
    solarReturn = { date: localDate(input.zone, at), inWindow: at >= window.fromMs && at < window.toMs };
  }

  const local = localParts(input.zone, instant.ms);
  let moonSigns: string[] | null = null;
  const daySignChanges: ChartVersion["daySignChanges"] = [];
  if (!timeKnown) {
    const m = moonSignCandidates(input.date, { timeZone: input.zone, longitude: input.lon });
    moonSigns = m.signs.map((slug) => SIGNS.find((s) => s.slug === slug)!.name);
    for (const b of shown) {
      if (b.body === "North Node") continue;
      const first = signIndexForLongitude(bodyLongitude(b.body, m.from));
      const last = signIndexForLongitude(bodyLongitude(b.body, m.to));
      if (first !== last) daySignChanges.push({ point: b.body, signs: [SIGNS[first]!.name, SIGNS[last]!.name] });
    }
  }
  return {
    label: instant.label,
    readOn: instant.readOn ?? null,
    utc: utc.toISOString().slice(0, 16) + "Z",
    localTime: `${local.date} ${local.time}`,
    timeKnown,
    placements,
    ascendant: asc === null ? null : placement("Ascendant", asc, asc, false),
    midheaven: mc === null ? null : placement("Midheaven", mc, asc, false),
    sect,
    sectTeam: sect === null ? null : SECT_TEAMS[sect],
    mercuryPhase,
    dignities,
    placidusUndefined,
    aspects,
    chartRuler,
    angleContacts: asc === null ? null : angleContactsFrom(aspects),
    angularHouses,
    solarReturn,
    edges,
    risingShift,
    transits,
    transitPoints: transitPoints.map((p) => p.name),
    stationContacts: stationContacts(stations, positions),
    dispositors: dispositorChains(placements.filter((p) => p.point !== "North Node"), timeKnown),
    moonSigns,
    daySignChanges
  };
}

// ------------------------------------------------------------------ entry

export async function buildReadingFacts(input: ReadingInput, options: ReadingOptions = {}): Promise<ReadingFacts> {
  const windowStart = options.windowStart ?? "2026-11-01";
  const days = options.days ?? 90;
  await prepareLocalTime(input.date, input.zone);
  const civil = resolveCivil(input);
  const fromMs = resolveLocalToUtc(windowStart, "00:00", input.zone).utc.getTime();
  const toMs = resolveLocalToUtc(addDays(windowStart, days), "00:00", input.zone).utc.getTime();
  const stations = findStations(fromMs, toMs, input.zone);
  const timeKnown = civil.status !== "time-unknown";
  return {
    input,
    status: civil.status,
    lmt: civil.lmt,
    offsets: civil.offsets,
    window: { from: windowStart, toInclusive: addDays(windowStart, days - 1), days, zone: input.zone },
    age: ageAt(input.date, windowStart),
    birthday: nextBirthday(input.date, windowStart, days),
    stations,
    versions: civil.instants.map((instant) => chartVersion(input, instant, timeKnown, { fromMs, toMs, from: windowStart, days }, stations))
  };
}

// ------------------------------------------------------------------ text sheet

/**
 * Every fact line of the sheet starts with a stable short ID in square
 * brackets, unique within the sheet and numbered in sheet order: N age and
 * next birthday, P placements, K sect, D dignities, A natal aspects, R chart
 * ruler, C planets on an angle, H angular houses, E sign edges, B solar
 * return, T transits,
 * S stations, and S1a, S1b, ... each contact of station S1. The same input and
 * options give the same IDs. `check-reading.ts` parses these lines.
 *
 * A fold or gap sheet has two charts, A and B. Each chart's lines carry its
 * letter (`[A-T3]`, `[B-T3]`, numbered within the chart); the lines before
 * the charts (N), the clock reading of each chart (G) and the comparison of
 * the two (X) belong to both.
 */
class Ids {
  private readonly counts = new Map<string, number>();
  constructor(private readonly chart = "") {}
  next(prefix: string): string {
    const n = (this.counts.get(prefix) ?? 0) + 1;
    this.counts.set(prefix, n);
    return `[${this.chart}${prefix}${n}]`;
  }
}

/** The IDs given to one chart's lines, for the comparison of two charts. */
interface ChartRefs {
  placements: Map<string, string>;
  aspects: string[];
  angles: string[];
  transits: string[];
  /** Per station, the ID of each contact. */
  stations: string[][];
}

const transitKey = (t: Transit) => `transiting ${t.body} ${t.aspect} natal ${t.natal}`;
const transitWhen = (t: Transit) => (t.range ? `in orb ${t.range.openStart ? "before " : ""}${t.range.from} to ${t.range.openEnd ? "after " : ""}${t.range.to}, ` : "") + (t.exact.length ? `exact ${t.exact.join(", ")}` : "no exact hit");
const aspectKey = (a: NatalAspect) => `${a.a} ${a.type} ${a.b}`;

/** Signs apart for each aspect that has a whole-sign form: a conjunction in one sign, a sextile two signs apart, and so on. */
const SIGNS_APART: Readonly<Record<string, number>> = { conjunction: 0, semisextile: 1, sextile: 2, square: 3, trine: 4, quincunx: 5, opposition: 6 };

/** ", out of sign (Venus in Leo, Uranus in Cancer)" when an aspect's two points are not the aspect's number of signs apart. */
function outOfSign(a: { a: string; b: string; type: string }, signs: Map<string, string>): string {
  const apart = SIGNS_APART[a.type];
  const sa = signs.get(a.a);
  const sb = signs.get(a.b);
  if (apart === undefined || !sa || !sb) return "";
  const names = SIGNS.map((x) => x.name as string);
  const d = Math.abs(names.indexOf(sa) - names.indexOf(sb));
  return Math.min(d, 12 - d) === apart ? "" : `, out of sign (${a.a} in ${sa}, ${a.b} in ${sb})`;
}

/**
 * The engine's comparison of the two charts of a fold or gap: what they share
 * and where they differ, line by line, with both charts' IDs.
 */
function comparisonLines(vs: ChartVersion[], refs: ChartRefs[], ids: Ids): string[] {
  const [a, b] = vs as [ChartVersion, ChartVersion];
  const [ra, rb] = refs as [ChartRefs, ChartRefs];
  const L: string[] = [];
  const list = (xs: string[]) => (xs.length ? xs.join("; ") : "none");
  L.push("=== Both charts compared (engine comparison of chart A and chart B, line by line; quote it, never compare the charts yourself) ===");
  if (a.chartRuler && b.chartRuler) {
    L.push(`${ids.next("X")} Rising sign and chart ruler: ${a.chartRuler.risingSign === b.chartRuler.risingSign
      ? `the same in both charts: ${a.chartRuler.risingSign} rising, chart ruler ${a.chartRuler.planet}, so the whole sign houses are the same`
      : `differ: chart A ${a.chartRuler.risingSign} rising, chart ruler ${a.chartRuler.planet}; chart B ${b.chartRuler.risingSign} rising, chart ruler ${b.chartRuler.planet}`}.`);
  }
  if (a.sect && b.sect) L.push(`${ids.next("X")} Sect: ${a.sect === b.sect ? `the same in both charts: ${a.sect} chart` : `differs: chart A ${a.sect} chart; chart B ${b.sect} chart`}.`);
  const placeDiff: string[] = [];
  for (const p of a.placements) {
    const q = b.placements.find((x) => x.point === p.point);
    if (!q) continue;
    if (p.sign !== q.sign || p.house !== q.house) placeDiff.push(`${p.point} (chart A ${p.sign}${p.house === null ? "" : `, house ${p.house}`} ${ra.placements.get(p.point)}; chart B ${q.sign}${q.house === null ? "" : `, house ${q.house}`} ${rb.placements.get(q.point)})`);
  }
  L.push(`${ids.next("X")} Signs and whole sign houses of the planets and node: ${placeDiff.length ? `differ for ${placeDiff.join("; ")}; every other point is in the same sign and house in both charts` : "the same in both charts (degrees differ)"}.`);
  if (a.angleContacts && b.angleContacts) {
    const ka = (c: AngleContact) => `${c.point} on the ${c.on}`;
    const both = a.angleContacts.filter((c) => b.angleContacts!.some((d) => ka(d) === ka(c))).map((c) => `${ka(c)} (${ra.angles[a.angleContacts!.indexOf(c)]}/${rb.angles[b.angleContacts!.findIndex((d) => ka(d) === ka(c))]})`);
    const onlyA = a.angleContacts.filter((c) => !b.angleContacts!.some((d) => ka(d) === ka(c))).map((c) => `${ka(c)} ${ra.angles[a.angleContacts!.indexOf(c)]}`);
    const onlyB = b.angleContacts.filter((c) => !a.angleContacts!.some((d) => ka(d) === ka(c))).map((c) => `${ka(c)} ${rb.angles[b.angleContacts!.indexOf(c)]}`);
    L.push(`${ids.next("X")} Planets on an angle: in both charts: ${list(both)}. Only in chart A: ${list(onlyA)}. Only in chart B: ${list(onlyB)}.`);
  }
  const aspectsIn = (x: ChartVersion, y: ChartVersion, rx: ChartRefs) => x.aspects.filter((p) => !y.aspects.some((q) => aspectKey(q) === aspectKey(p))).map((p) => `${aspectKey(p)} ${rx.aspects[p.rank - 1]}`);
  const tight = (x: ChartVersion, rx: ChartRefs) => (x.aspects[0] ? `${aspectKey(x.aspects[0])} ${rx.aspects[0]}` : "none");
  L.push(`${ids.next("X")} Tightest aspect: ${a.aspects[0] && b.aspects[0] && aspectKey(a.aspects[0]) === aspectKey(b.aspects[0]) ? `the same in both charts: ${aspectKey(a.aspects[0])} (${ra.aspects[0]}/${rb.aspects[0]})` : `differs: chart A ${tight(a, ra)}; chart B ${tight(b, rb)}`}.`);
  L.push(`${ids.next("X")} Natal aspects only in chart A: ${list(aspectsIn(a, b, ra))}. Only in chart B: ${list(aspectsIn(b, a, rb))}. Every other aspect is in both charts (orbs may differ: quote each chart's own line).`);
  const sameT: string[] = [];
  const diffT: string[] = [];
  const onlyTA: string[] = [];
  a.transits.forEach((t, i) => {
    const j = b.transits.findIndex((u) => transitKey(u) === transitKey(t));
    if (j < 0) { onlyTA.push(`${transitKey(t)} ${ra.transits[i]}`); return; }
    const u = b.transits[j]!;
    if (transitWhen(t) === transitWhen(u)) sameT.push(`${ra.transits[i]}/${rb.transits[j]}`);
    else diffT.push(`${transitKey(t)} (chart A ${ra.transits[i]} ${transitWhen(t)}; chart B ${rb.transits[j]} ${transitWhen(u)})`);
  });
  const onlyTB = b.transits.map((u, j) => (a.transits.some((t) => transitKey(t) === transitKey(u)) ? null : `${transitKey(u)} ${rb.transits[j]}`)).filter((x): x is string => !!x);
  L.push(`${ids.next("X")} Transits in both charts with the same dates: ${list(sameT)}.`);
  L.push(`${ids.next("X")} Transits in both charts with different dates: ${list(diffT)}.`);
  L.push(`${ids.next("X")} Transits only in chart A: ${list(onlyTA)}. Only in chart B: ${list(onlyTB)}.`);
  const contacts = (v: ChartVersion, rv: ChartRefs) => v.stationContacts.flatMap((s, i) => s.contacts.map((c, k) => ({ key: `stationing ${s.station.body} ${c.type} natal ${c.natal}`, orb: orbText(c.orb), id: rv.stations[i]![k]! })));
  const ca = contacts(a, ra);
  const cb = contacts(b, rb);
  const sameS = ca.filter((c) => cb.some((d) => d.key === c.key && d.orb === c.orb)).map((c) => `${c.id}/${cb.find((d) => d.key === c.key)!.id}`);
  const diffS = ca.filter((c) => cb.some((d) => d.key === c.key && d.orb !== c.orb)).map((c) => { const d = cb.find((x) => x.key === c.key)!; return `${c.key} (chart A ${c.id} orb ${c.orb}; chart B ${d.id} orb ${d.orb})`; });
  const onlySA = ca.filter((c) => !cb.some((d) => d.key === c.key)).map((c) => `${c.key} ${c.id}`);
  const onlySB = cb.filter((d) => !ca.some((c) => c.key === d.key)).map((d) => `${d.key} ${d.id}`);
  L.push(`${ids.next("X")} Station contacts in both charts with the same orb: ${list(sameS)}. In both with different orbs: ${list(diffS)}. Only in chart A: ${list(onlySA)}. Only in chart B: ${list(onlySB)}.`);
  return L;
}

function placementLine(p: Placement): string {
  const house = p.house === null ? "" : `, whole sign house ${p.house}`;
  return `${p.point} ${p.degree} ${p.sign}${house}${p.retrograde ? ", retrograde" : ""}`;
}

/** "; transiting Saturn in Aries, whole sign house 7", with the dates when the sign or house differs between them. */
function positionText(t: Transit): string {
  const where = (p: Transit["positions"][number]) => `${p.sign}${p.house === null ? "" : `, whole sign house ${p.house}`}`;
  const groups: { where: string; dates: string[] }[] = [];
  for (const p of t.positions) {
    const w = where(p);
    const g = groups.find((x) => x.where === w);
    if (g) { if (!g.dates.includes(p.date)) g.dates.push(p.date); } else groups.push({ where: w, dates: [p.date] });
  }
  if (groups.length === 0) return "";
  if (groups.length === 1) return `; transiting ${t.body} in ${groups[0]!.where}`;
  return `; transiting ${t.body} ${groups.map((g, i) => `${i ? "; " : ""}in ${g.where} on ${g.dates.join(", ")}`).join("")}`;
}

function transitLine(t: Transit): string {
  return transitHead(t) + positionText(t);
}

function transitHead(t: Transit): string {
  const head = `transiting ${t.body} ${t.aspect} natal ${t.natal}`;
  if (t.range) {
    const from = t.range.openStart ? `before ${t.range.from}` : t.range.from;
    const to = t.range.openEnd ? `after ${t.range.to}` : t.range.to;
    const exact = t.exact.length ? `; exact ${t.exact.join(", ")} (each plus or minus 1 day)` : "; no exact hit in this range";
    const why = t.nearStation ? " (near a station: give the range, not a single day)" : "";
    return `${head}: in orb (within ${RANGE_ORB}°) from ${from} to ${to} (each end plus or minus 1 day)${exact}${why}`;
  }
  return `${head}: exact ${t.exact.join(", ")}`;
}

function ageLine(a: Age): string {
  if (a.bornAfterStart) return `Age at the window start (${a.at}): not yet born; the birth date is ${a.daysAfterStart} days into the window. Stage: infant.`;
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return `Age at the window start (${a.at}): ${unit(a.years, "year")} ${unit(a.months, "month")} (calendar age from the local birth date). Stage: ${a.stage}${a.stage === "adult" ? "" : " (under 18)"}.`;
}

function birthdayLine(b: Birthday | null, birth: string, window: ReadingFacts["window"]): string {
  if (!b) return `Next birthday: none to give; the birth date ${birth} is on or after the window start.`;
  const where = b.date === window.from ? "the first day of the window" : b.inWindow ? "inside the window" : "after the window";
  const leap = b.leapDay ? " Born on 29 February: in a common year this sheet gives 1 March; some keep 28 February." : "";
  return `Next birthday (calendar anniversary of the local birth date ${birth}): ${b.date}, when the person turns ${b.turns}; ${where}.${leap}`;
}

function teamLine(t: SectTeam): string {
  return `${t.sect} chart: sect light ${t.light}; benefic of sect ${t.beneficOfSect}; malefic of sect ${t.maleficOfSect}; benefic contrary to sect ${t.beneficContrary}; malefic contrary to sect (the out-of-sect malefic) ${t.maleficContrary}`;
}

function spanText(s: { planet: string; from: number; to: number }): string {
  return `${s.planet} (${s.from}° to ${s.to}°)`;
}

function dignityLine(d: PlanetDignity, sect: "day" | "night" | null): string {
  const held = d.dignities.length ? d.dignities.join(", ") : "none";
  const ifSect = d.triplicityIf.length ? `; triplicity only if a ${d.triplicityIf.join(" or ")} chart` : "";
  const peregrine = d.peregrine === null ? "peregrine unless it holds triplicity (depends on sect)" : d.peregrine ? "peregrine (no essential dignity)" : "not peregrine";
  const l = d.lords;
  const counted = sect ? `, counted for this ${sect} chart: ${l.triplicity[sect]}` : ", sect unknown so none is counted";
  return `${d.planet} ${d.degree} ${d.sign}: dignities ${held}${ifSect}; debilities ${d.debilities.length ? d.debilities.join(", ") : "none"}; ${peregrine}. Lords here: domicile ${l.domicile}; exaltation ${l.exaltation ?? "none"}; triplicity (${l.element}) day ${l.triplicity.day}, night ${l.triplicity.night}, participating ${l.triplicity.participating}${counted}; term ${spanText(l.term)}; face ${spanText(l.face)}; detriment ${l.detriment}; fall ${l.fall ?? "none"}.`;
}

export function formatReadingFacts(f: ReadingFacts): string {
  const L: string[] = [];
  const ids = new Ids();
  const outer = ids;
  const z = f.input.zone;
  L.push("ENGINE FACTS (computed by @zodiacs/engine; every number below is final. Quote them; never recompute, compare, re-rank or round them.)");
  L.push("Each fact line starts with an ID in square brackets: a letter and a number, such as T3. Name an aspect, transit, station or contact only by quoting its line with that ID, exactly as written: the same planets, the same aspect word, the same order.");
  L.push(`resolve_civil_time status: ${f.status}`);
  L.push(`${ids.next("N")} ${ageLine(f.age)}`);
  L.push(`${ids.next("N")} ${birthdayLine(f.birthday, f.input.date, f.window)}`);
  if (f.lmt) L.push("Zone note: the birthplace kept local mean time on this date; the engine used the birthplace's local mean time.");
  if (f.status === "fold") {
    L.push(`The local time ${f.input.time} happened twice in ${z} (clock went from ${offsetText(f.offsets!.before)} to ${offsetText(f.offsets!.after)}). Both charts follow. Ask the person which occurrence, or read only what both share.`);
  } else if (f.status === "gap") {
    L.push(`The local time ${f.input.time} did not exist in ${z} (clock jumped from ${offsetText(f.offsets!.before)} to ${offsetText(f.offsets!.after)}). Both candidate charts follow. Do not pick one; ask the person, and read only what both share.`);
  } else if (f.status === "time-unknown") {
    L.push("Birth time unknown: the chart below is a reference at local noon with planets only. No houses, no Ascendant, no Midheaven, no sect, no Moon degree. Moon: sign range for the day only.");
  }
  const two = f.versions.length === 2;
  const refs: ChartRefs[] = [];
  if (two) {
    // Which clock reading gives which chart, so the person can be asked in their own terms.
    f.versions.forEach((v, i) => {
      const letter = i === 0 ? "A" : "B";
      const on = offsetText(v.readOn!.offset);
      const clock = v.readOn!.side === "before" ? `a clock still on ${on}, before the change` : `a clock already on ${on}, after the change`;
      const what = f.status === "fold" ? `the ${i === 0 ? "earlier" : "later"} occurrence of ${f.input.time}` : `${f.input.time} read on ${on}`;
      L.push(`${ids.next("G")} Chart ${letter} is ${what}: ${f.input.time} on ${clock}. Instant ${v.utc}; the zone's clocks showed ${v.localTime}.`);
    });
    L.push("Every line below carries its chart's letter: [A-...] lines are chart A, [B-...] lines chart B. Name the chart of every chart-specific fact, and quote a fact the two charts share with both IDs (as the comparison at the end gives them).");
  }
  for (const [vi, v] of f.versions.entries()) {
    const letter = vi === 0 ? "A" : "B";
    const ids = two ? new Ids(`${letter}-`) : outer;
    const ref: ChartRefs = { placements: new Map(), aspects: [], angles: [], transits: [], stations: [] };
    refs.push(ref);
    L.push("");
    L.push(two ? `=== Chart ${letter}: ${v.label} ===` : `=== Chart: ${v.label} ===`);
    L.push(`Instant: ${v.utc} (local ${v.localTime}, ${z}). Tropical zodiac, ${v.timeKnown ? "whole sign houses, " : "no houses, "}true node.`);
    if (v.ascendant && v.midheaven) {
      ref.placements.set("Ascendant", ids.next("P"));
      L.push(`${ref.placements.get("Ascendant")} Ascendant ${v.ascendant.degree} ${v.ascendant.sign}; Midheaven ${v.midheaven.degree} ${v.midheaven.sign} (whole sign house ${v.midheaven.house})`);
    }
    for (const p of v.placements) {
      const id = ids.next("P");
      ref.placements.set(p.point, id);
      L.push(`${id} ${placementLine(p)}`);
    }
    if (v.moonSigns) {
      L.push(`${ids.next("P")} ${v.moonSigns.length === 1
        ? `Moon: in ${v.moonSigns[0]} for the whole local date (degree unknown without a birth time).`
        : `Moon: changes sign during the local date: ${v.moonSigns.join(" then ")}. Its sign depends on the unknown birth time.`}`);
    }
    for (const c of v.daySignChanges) {
      L.push(`${ids.next("P")} ${c.point}: changes sign during the local date (${c.signs.join(" then ")}); its sign depends on the unknown birth time. The degree above is at the noon reference only.`);
    }
    if (!v.timeKnown) L.push("Degrees and orbs below are at the noon reference instant; with no birth time they are approximate for the day.");

    L.push(`${ids.next("K")} ${v.sect === null
      ? "Sect: unavailable (needs a birth time)."
      : `Sect (engine): ${v.sect} chart (${v.sect === "day" ? "Sun above the horizon" : "Sun below the horizon"}).`}`);
    if (v.sectTeam) {
      L.push(`${ids.next("K")} Sect team (Ptolemy, Tetrabiblos I.7), ${teamLine(v.sectTeam)}. Use this team; do not apply the other sect's.`);
    } else {
      L.push(`${ids.next("K")} Sect teams (Ptolemy, Tetrabiblos I.7), for reference only because sect is unavailable: if a ${teamLine(SECT_TEAMS.day)}. If a ${teamLine(SECT_TEAMS.night)}. Do not name a sect light, a benefic or malefic of sect, or an out-of-sect malefic for this chart.`);
    }
    L.push(`${ids.next("K")} Mercury: ${v.mercuryPhase} star (${v.mercuryPhase === "morning" ? "west of the Sun, rises before it" : "east of the Sun, sets after it"}), so it joins the ${v.mercuryPhase === "morning" ? "day" : "night"} sect (Tetrabiblos I.7).`);
    if (v.placidusUndefined) L.push("Placidus houses: undefined at this latitude (polar); the whole sign houses above are unaffected.");

    L.push("Essential dignities (engine, @zodiacs/engine/techniques): domiciles Tetrabiblos I.17; exaltations and falls Tetrabiblos I.19; detriments the signs opposite the domiciles; Dorothean triplicities (Dorotheus I.1.3), the lord of the chart's sect counted, not the participating lord; Egyptian terms (Tetrabiblos I.20); Chaldean faces; peregrine means no essential dignity (Lilly, Christian Astrology, p. 112). Seven classical planets only; Uranus, Neptune, Pluto and the node have none in this scheme. Quote these; never decide a dignity yourself:");
    const dignityIds = new Map<string, string>();
    for (const d of v.dignities) {
      const id = ids.next("D");
      dignityIds.set(d.planet, id);
      L.push(`${id} ${dignityLine(d, v.sect)}`);
    }

    L.push(`Natal aspects, ENGINE RANKING by orb, tightest first (orbs to the arcminute; ${v.aspects.length} aspects; quote this order, do not re-rank; "out of sign" marks an aspect whose two points are not in the signs that aspect joins, which is weaker by sign):`);
    const aspectIds = v.aspects.map(() => ids.next("A"));
    ref.aspects = aspectIds;
    const signOf = new Map<string, string>(v.placements.map((p) => [p.point, p.sign]));
    if (v.ascendant) signOf.set("Ascendant", v.ascendant.sign);
    if (v.midheaven) signOf.set("Midheaven", v.midheaven.sign);
    const aspectRef = (a: NatalAspect) => `${aspectIds[a.rank - 1]} ${a.a} ${a.type} ${a.b}, orb ${orbText(a.orb)}`;
    if (v.aspects.length) {
      L.push(`Tightest aspect: ${aspectRef(v.aspects[0]!)}${outOfSign(v.aspects[0]!, signOf)}`);
      v.aspects.forEach((a, i) => L.push(`${aspectIds[i]} ${a.rank}. ${a.a} ${a.type} ${a.b}, orb ${orbText(a.orb)}${outOfSign(a, signOf)}`));
    } else L.push("none within the engine's default orbs");

    L.push("Chart ruler (the domicile lord of the rising sign, traditional rulers; engine facts, quote them):");
    const r = v.chartRuler;
    if (!r) {
      L.push(`${ids.next("R")} Chart ruler: unavailable (the rising sign needs a birth time).`);
    } else {
      const d = r.dignity;
      const condition = `dignities ${d.dignities.length ? d.dignities.join(", ") : "none"}; debilities ${d.debilities.length ? d.debilities.join(", ") : "none"}; ${d.peregrine === null ? "peregrine unless it holds triplicity" : d.peregrine ? "peregrine" : "not peregrine"}`;
      L.push(`${ids.next("R")} Chart ruler: ${r.planet} (${r.risingSign} rising). ${placementLine(r.placement)}. Condition (${dignityIds.get(r.planet)}): ${condition}. Sect role: ${r.sectRole}.`);
      L.push(`${ids.next("R")} Chart ruler's aspects, in the ranking's order: ${r.aspects.length ? r.aspects.map(aspectRef).join("; ") : `none: ${r.planet} has no aspect in the ranking`}.`);
    }

    L.push("Dispositors (each body's domicile lord by the traditional rulers, followed lord to lord; engine facts, quote them):");
    for (const c of v.dispositors.chains) {
      const end = c.end.kind === "domicile"
        ? `ends at ${c.end.planet}, in its own sign`
        : c.end.kind === "loop"
          ? `ends in a loop: ${c.end.planets.join(", ")} dispose one another`
          : "stops at the Moon, whose sign is unknown without a birth time";
      L.push(`${ids.next("L")} ${c.point} in ${c.sign}: domicile lord ${c.lord}. Chain: ${c.chain.join(" → ")} (${end}).`);
    }
    const d = v.dispositors;
    const endings = [...new Set(d.chains.filter((c) => (CLASSICAL_PLANETS as readonly string[]).includes(c.point)).map((c) => c.end.kind === "domicile" ? `${c.end.planet} (in its own sign)` : c.end.kind === "loop" ? `the loop ${c.end.planets.join(", ")}` : "the Moon (sign unknown)"))];
    L.push(`${ids.next("L")} Final dispositor: ${d.final ? `${d.final}; every classical planet's chain ends there` : `none; the chains end at ${endings.join(" and ")}`}.`);
    L.push(`${ids.next("L")} Mutual receptions by domicile (each planet in the other's sign): ${d.mutual.length ? d.mutual.map(([a, b]) => `${a} and ${b}`).join("; ") : "none"}.`);

    if (v.angleContacts) {
      const n = v.angleContacts.length;
      L.push(`Planets on an angle (a conjunction or opposition with the Ascendant or Midheaven in the ranking above, the engine's default orbs): ${n === 0 ? "none" : `${n} in all (${v.angleContacts.map((c) => c.point).join(", ")}); this is the count, do not count them yourself, and name every one if you list them`}.`);
      L.push("How to read them: a conjunction with the Ascendant puts the planet on the Ascendant (the rising degree), an opposition with the Ascendant puts it on the Descendant, a conjunction with the Midheaven puts it on the Midheaven (MC), and an opposition with the Midheaven puts it on the IC. A planet not listed here is on no angle, whatever its house:");
      if (v.angleContacts.length === 0) L.push(`${ids.next("C")} none: no planet or node is on the Ascendant, Descendant, Midheaven or IC within the engine's default orbs.`);
      for (const c of v.angleContacts) {
        const id = ids.next("C");
        ref.angles.push(id);
        L.push(`- ${id} ${c.point} ${c.type} ${c.angle}, orb ${orbText(c.orb)}${outOfSign({ a: c.point, b: c.angle, type: c.type }, signOf)}: on the ${c.on}, same as ${aspectIds[c.rank - 1]}`);
      }
    }
    if (v.angularHouses) {
      const held = v.angularHouses.filter((h) => h.points.length).map((h) => `house ${h.house} ${h.points.join(", ")}`);
      L.push(`${ids.next("H")} Points in the angular houses (whole sign houses 1, 4, 7 and 10; a house placement, not a contact with the angle's degree): ${held.length ? held.join("; ") : "none"}.`);
    }

    if (v.risingShift) {
      // The rising sign's birth-time margin, whether or not the Ascendant is near an edge (v7 O15: "not the rising sign" was guessed).
      const r = v.risingShift;
      const way = (x: { sign: string; minutes: number } | null, dir: string) => (x ? `${x.sign} if the birth time were ${x.minutes} ${x.minutes === 1 ? "minute" : "minutes"} ${dir} or more` : `no other sign within 720 minutes ${dir}`);
      L.push("Rising sign and the birth time (engine check; every whole sign house, the chart ruler and the angle contacts change with the rising sign):");
      L.push(`- ${ids.next("E")} Rising sign ${r.sign} (Ascendant ${r.degree} ${r.sign}): it would be ${way(r.earlier, "earlier")}, and ${way(r.later, "later")}.`);
    }
    L.push(`Points within ${EDGE_DEGREES}° of a sign edge (engine check over every point listed above):`);
    if (v.edges.length === 0) L.push(`${ids.next("E")} none: no listed point is within ${EDGE_DEGREES}° of a sign edge.`);
    for (const e of v.edges) {
      const where = e.edge === "start" ? `${orbText(e.distance)} after the start of ${e.sign} (${e.neighbour} before it)` : `${orbText(e.distance)} before the end of ${e.sign} (${e.neighbour} next)`;
      const shift = e.shiftMinutes === null
        ? ""
        : `; it would be in ${e.neighbour} if the birth time were ${e.shiftMinutes} ${e.shiftMinutes === 1 ? "minute" : "minutes"} ${e.edge === "start" ? "earlier" : "later"} or more`;
      L.push(`- ${ids.next("E")} ${e.point} ${e.degree} ${e.sign}: ${where}${shift}`);
    }

    if (v.solarReturn) {
      const where = v.solarReturn.inWindow ? "inside the window" : "after the window";
      const approx = v.timeKnown ? "" : " (from the noon reference: plus or minus 1 day)";
      L.push(`${ids.next("B")} Solar return (transiting Sun conjunction natal Sun, the Sun back at its birth longitude) for the birthday of ${f.birthday!.date}: exact ${v.solarReturn.date}${approx}, ${where}, date in ${z}.`);
    }
    L.push(`Transits ${f.window.from} to ${f.window.toInclusive} inclusive (${f.window.days} days), dates in the person's zone (${z}). Bodies: ${TRANSITING.join(", ")}. Aspects: ${TRANSIT_ASPECTS.join(", ")}. Natal points: ${v.transitPoints.join(", ")}. Uranus, Neptune and Pluto are given as in-orb date ranges, never as a single day:`);
    if (v.transits.length === 0) L.push("- none in the window for these bodies, aspects and points.");
    for (const t of v.transits) {
      const id = ids.next("T");
      ref.transits.push(id);
      L.push(`- ${id} ${transitLine(t)}`);
    }

    L.push(`Stations in the window and their contacts with natal points (major aspects within ${STATION_ORB}°; checked against ${v.stationContacts[0]?.checked.join(", ") ?? "the natal points"}):`);
    if (v.stationContacts.length === 0) L.push("- no station in the window.");
    for (const s of v.stationContacts) {
      const sid = ids.next("S");
      ref.stations.push(s.contacts.map((_, i) => `${sid.slice(0, -1)}${String.fromCharCode(97 + i)}]`));
      const stationHouse = v.ascendant ? `, whole sign house ${placement(s.station.body, s.station.lon, v.ascendant.lon, false).house}` : "";
      const head = `${s.station.body} stations ${s.station.kind} ${s.station.localDate} (plus or minus 1 day) at ${degreeText(s.station.lon)} ${signName(s.station.lon)}${stationHouse}`;
      if (s.contacts.length === 0) {
        L.push(`- ${sid} ${head}: no natal point within ${STATION_ORB}° of a major aspect (computed).`);
        continue;
      }
      L.push(`- ${sid} ${head}. Contacts:`);
      s.contacts.forEach((c, i) => L.push(`  - ${sid.slice(0, -1)}${String.fromCharCode(97 + i)}] stationing ${s.station.body} ${c.type} natal ${c.natal}, orb ${orbText(c.orb)}`));
    }
  }
  if (two) {
    L.push("");
    L.push(...comparisonLines(f.versions, refs, outer));
  }
  return L.join("\n");
}
